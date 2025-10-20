#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { getData } = require('./get-data');

const NOTIONAL_USD = 4000; // capital 400 * 10x
const CAPITAL_USD = 400;
const H = 5; // bars to look ahead

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { signalsPath: null };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const v = args[i + 1];
    if (a === '--signals') out.signalsPath = v;
  }
  return out;
}

function loadLatestSignalsJSON() {
  const dir = path.join('trades', 'reports');
  const files = fs.readdirSync(dir)
    .filter(f => /^signals-\d+\.json$/.test(f))
    .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error('No signals-*.json found in trades/reports');
  const p = path.join(dir, files[0].f);
  return { json: JSON.parse(fs.readFileSync(p, 'utf8')), path: p };
}

function assertFiniteNumber(n, name) {
  if (!Number.isFinite(n)) throw new Error(`ASSERT FAILED: ${name} is not finite`);
}

function findSignalIndex(candles, dtISO) {
  return candles.findIndex(c => c.openTimeISO === dtISO);
}

function computeDistancesAndRR(side, entry, sl, tp1) {
  if (side === 'LONG') {
    const slDistPct = (entry - sl) / entry; // >0
    const tp1DistPct = (tp1 - entry) / entry; // >0
    return { slPct: Math.abs(slDistPct) * 100, tp1Pct: Math.abs(tp1DistPct) * 100, rr: tp1DistPct / slDistPct };
  } else {
    const slDistPct = (sl - entry) / entry; // >0
    const tp1DistPct = (entry - tp1) / entry; // >0
    return { slPct: Math.abs(slDistPct) * 100, tp1Pct: Math.abs(tp1DistPct) * 100, rr: tp1DistPct / slDistPct };
  }
}

function evaluateExit(side, entry, sl, tp1, window) {
  // window: array of next candles (length <= H), each { high, low, close }
  for (let i = 0; i < window.length; i += 1) {
    const c = window[i];
    const barIndex = i + 1; // bars from entry
    const touchedTP = side === 'LONG' ? (c.high >= tp1) : (c.low <= tp1);
    const touchedSL = side === 'LONG' ? (c.low <= sl) : (c.high >= sl);
    if (touchedTP && touchedSL) {
      // side-aware tie-break: prioritize SL conservatively
      return { exit_reason: 'SL', exit_price: sl, bars_to_exit: barIndex, tie: true };
    }
    if (touchedTP) return { exit_reason: 'TP', exit_price: tp1, bars_to_exit: barIndex };
    if (touchedSL) return { exit_reason: 'SL', exit_price: sl, bars_to_exit: barIndex };
  }
  // EXP: close at last bar close if neither hit within H
  const last = window[window.length - 1];
  return { exit_reason: 'EXP', exit_price: last ? last.close : entry, bars_to_exit: window.length };
}

function computeGrossPct(side, entry, exit) {
  const raw = (exit / entry) - 1;
  return side === 'LONG' ? raw : -raw;
}

function computeCostsAndROI(grossPct) {
  // bps: taker 10, maker 4. slippage 2 (round-trip all included)
  const takerCost = 0.0010 + 0.0002;
  const makerCost = 0.0004 + 0.0002;
  const netPctTaker = grossPct - takerCost;
  const netPctMaker = grossPct - makerCost;
  const netUsdTaker = NOTIONAL_USD * netPctTaker;
  const netUsdMaker = NOTIONAL_USD * netPctMaker;
  const roiCapitalTaker = netUsdTaker / CAPITAL_USD;
  const roiCapitalMaker = netUsdMaker / CAPITAL_USD;
  return { netPctTaker, netUsdTaker, netPctMaker, netUsdMaker, roiCapitalTaker, roiCapitalMaker };
}

function computeMFE_MAE(side, entry, window) {
  let mfe = 0; // favorable percent
  let mae = 0; // adverse percent
  for (const c of window) {
    if (side === 'LONG') {
      const fav = (c.high / entry) - 1;
      const adv = (c.low / entry) - 1;
      mfe = Math.max(mfe, fav);
      mae = Math.min(mae, adv);
    } else {
      const fav = (entry / c.low) - 1; // approximate symmetrical measure
      const adv = (entry / c.high) - 1;
      // Convert to pct similar to LONG metric: use price deltas normalized by entry
      const favPct = (entry - c.low) / entry; // >=0
      const advPct = (c.high - entry) / entry; // >=0
      mfe = Math.max(mfe, favPct);
      mae = Math.max(mae, advPct) * -1; // store MAE negative for consistency
    }
  }
  // normalize to percents
  return { MFE_pct: mfe * 100, MAE_pct: mae * 100 };
}

async function main() {
  const { signalsPath } = parseArgs();
  const { json: sigDoc, path: usedSignalsPath } = signalsPath ? { json: JSON.parse(fs.readFileSync(signalsPath, 'utf8')), path: signalsPath } : loadLatestSignalsJSON();
  const { symbol, timeframe, quantity, previousCandles } = sigDoc.params;

  // Load candles for evaluation window (same call used by pipeline)
  const candles = await getData(symbol, quantity, undefined, previousCandles, timeframe);
  if (!candles || !candles.length) throw new Error('No candles from getData');

  const perSignal = [];
  let wins = 0, losses = 0, expires = 0;
  let netUsdTakerSum = 0, netUsdMakerSum = 0;
  let maxEquity = 0, equity = 0, maxDrawdownUsdTaker = 0;

  for (const s of sigDoc.signals) {
    const { side, entry, sl, tp1, id, dtISO } = s;
    const idx = findSignalIndex(candles, dtISO);
    if (idx < 0) throw new Error(`Signal candle not found for ${id}`);
    const window = candles.slice(idx + 1, idx + 1 + H);
    if (window.length === 0) throw new Error(`No forward window for ${id}`);
    if (window.length > H) throw new Error('ASSERT FAILED: window length exceeds H');

    // distances and rr (magnitudes, positive)
    const d = computeDistancesAndRR(side, entry, sl, tp1);
    assertFiniteNumber(d.slPct, 'slPct');
    assertFiniteNumber(d.tp1Pct, 'tp1Pct');
    assertFiniteNumber(d.rr, 'rr');
    // rr approx equals tp1Pct/slPct
    const approxRR = (d.tp1Pct / d.slPct);
    if (Math.abs(approxRR - d.rr) > 1e-6) throw new Error('ASSERT FAILED: RR mismatch with distances');

    // first-touch exit within H
    const ex = evaluateExit(side, entry, sl, tp1, window);
    const grossPct = computeGrossPct(side, entry, ex.exit_price);
    if (ex.exit_reason === 'TP' && grossPct <= 0) throw new Error('ASSERT FAILED: TP but non-positive gross');
    if (ex.exit_reason === 'SL' && grossPct >= 0) throw new Error('ASSERT FAILED: SL but non-negative gross');

    const costs = computeCostsAndROI(grossPct);

    const mfeMae = computeMFE_MAE(side, entry, window);

    const row = {
      id,
      ts: dtISO,
      side,
      entry,
      sl,
      tp1,
      rr: d.rr,
      slPct: d.slPct,
      tp1Pct: d.tp1Pct,
      exit_reason: ex.exit_reason,
      exit_price: ex.exit_price,
      bars_to_exit: ex.bars_to_exit,
      gross_pct: grossPct * 100,
      net_pct_taker: costs.netPctTaker * 100,
      net_usd_taker: costs.netUsdTaker,
      net_pct_maker: costs.netPctMaker * 100,
      net_usd_maker: costs.netUsdMaker,
      roi_on_capital_taker: costs.roiCapitalTaker * 100,
      roi_on_capital_maker: costs.roiCapitalMaker * 100,
      MFE_pct: mfeMae.MFE_pct,
      MAE_pct: mfeMae.MAE_pct,
      eventScore: Number.isFinite(s.eventScore) ? s.eventScore : null,
      directionScore: Number.isFinite(s.directionScore) ? s.directionScore : null,
      flags: []
    };

    perSignal.push(row);

    // win/loss/exp counts
    if (row.exit_reason === 'TP') wins += 1;
    else if (row.exit_reason === 'SL') losses += 1;
    else expires += 1;

    // equity for drawdown (taker)
    equity += row.net_usd_taker;
    maxEquity = Math.max(maxEquity, equity);
    maxDrawdownUsdTaker = Math.max(maxDrawdownUsdTaker, maxEquity - equity);

    netUsdTakerSum += row.net_usd_taker;
    netUsdMakerSum += row.net_usd_maker;
  }

  if (perSignal.length !== sigDoc.stats.total) throw new Error('ASSERT FAILED: per_signal length mismatch');
  // no NaNs
  for (const r of perSignal) {
    const nums = [r.rr, r.slPct, r.tp1Pct, r.gross_pct, r.net_pct_taker, r.net_usd_taker, r.net_pct_maker, r.net_usd_maker];
    for (const n of nums) assertFiniteNumber(n, 'metric');
  }

  const n = perSignal.length;
  const win_rate = n > 0 ? wins / n : 0;
  const expectancy_taker = n > 0 ? netUsdTakerSum / n : 0;
  const expectancy_maker = n > 0 ? netUsdMakerSum / n : 0;
  const roi_on_capital_taker = (netUsdTakerSum / CAPITAL_USD) * 100;
  const roi_on_capital_maker = (netUsdMakerSum / CAPITAL_USD) * 100;

  const out = {
    version: 'v6.6.2',
    symbol: sigDoc.params.symbol,
    timeframe: sigDoc.params.timeframe,
    H,
    notionalUSD: NOTIONAL_USD,
    costs: { takerBps: 10, makerBps: 4, slippageBps: 2 },
    summary: {
      n,
      wins,
      losses,
      expires,
      win_rate,
      net_usd_taker_sum: netUsdTakerSum,
      net_usd_maker_sum: netUsdMakerSum,
      expectancy_taker,
      expectancy_maker,
      roi_on_capital_taker,
      roi_on_capital_maker,
      max_drawdown_usd_taker: maxDrawdownUsdTaker
    },
    per_signal: perSignal
  };

  const reportsDir = path.join('trades', 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, 'pnl_v6.6.2.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  // Compact table output
  console.log('P&L_SUMMARY v6.6.2 | json=' + outPath);
  console.log('ts | side | exit | bars | net_usd_taker | roi_capital_taker% | MFE/MAE% | RR | sl%/tp1%');
  for (const r of perSignal) {
    const exitStr = `${r.exit_reason}@${r.exit_price.toFixed(2)}`;
    console.log(`${r.ts} | ${r.side} | ${exitStr} | ${r.bars_to_exit} | ${r.net_usd_taker.toFixed(2)} | ${r.roi_on_capital_taker.toFixed(2)} | ${r.MFE_pct.toFixed(2)}/${r.MAE_pct.toFixed(2)} | ${r.rr.toFixed(2)} | ${r.slPct.toFixed(2)}/${r.tp1Pct.toFixed(2)}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };


