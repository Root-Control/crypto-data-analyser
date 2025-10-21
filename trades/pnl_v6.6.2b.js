#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { getData } = require('./get-data');

const NOTIONAL_USD = 4000; // capital 400 * 10x
const CAPITAL_USD = 400;
const H = 5;

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

function computeATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close),
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function pct(n) { return n * 100; }
function assertFinite(n, name) { if (!Number.isFinite(n)) throw new Error(`ASSERT FAILED: ${name} not finite`); }

function distancesAndRR(side, entry, sl, tp1) {
  if (side === 'LONG') {
    const slDist = (entry - sl) / entry;
    const tpDist = (tp1 - entry) / entry;
    return { slPct: pct(Math.abs(slDist)), tp1Pct: pct(Math.abs(tpDist)), rr_real: tpDist / slDist };
  } else {
    const slDist = (sl - entry) / entry;
    const tpDist = (entry - tp1) / entry;
    return { slPct: pct(Math.abs(slDist)), tp1Pct: pct(Math.abs(tpDist)), rr_real: tpDist / slDist };
  }
}

function evaluatePath(side, entry, sl, tp1, window) {
  const pathArr = [];
  let exit = null;
  let tieCase = false;
  let tieResolved = null;
  for (let i = 0; i < H; i += 1) {
    const c = window[i];
    if (!c) break;
    const barOffset = i + 1;
    const hitTP = side === 'LONG' ? (c.high >= tp1) : (c.low <= tp1);
    const hitSL = side === 'LONG' ? (c.low <= sl) : (c.high >= sl);
    let hit = null;
    if (hitTP && hitSL) {
      tieCase = true;
      hit = 'SL';
      if (!exit) exit = { exit_reason: 'SL', exit_price: sl, bars_to_exit: barOffset };
      tieResolved = 'SL-first';
    } else if (hitTP) {
      hit = 'TP';
      if (!exit) exit = { exit_reason: 'TP', exit_price: tp1, bars_to_exit: barOffset };
    } else if (hitSL) {
      hit = 'SL';
      if (!exit) exit = { exit_reason: 'SL', exit_price: sl, bars_to_exit: barOffset };
    }
    pathArr.push({ barOffset, high: c.high, low: c.low, hit });
    if (exit) break;
  }
  // complete window to H length (audit) without peeking > H
  for (let i = pathArr.length; i < H; i += 1) {
    const c = window[i];
    if (!c) break;
    pathArr.push({ barOffset: i + 1, high: c.high, low: c.low, hit: null });
  }
  if (!exit) {
    const last = window[Math.min(H, window.length) - 1];
    exit = { exit_reason: 'EXP', exit_price: last ? last.close : entry, bars_to_exit: Math.min(H, window.length) };
  }
  return { exit, pathArr, tieCase, tieResolved };
}

function grossPct(side, entry, exitPrice) {
  const raw = (exitPrice / entry) - 1;
  return side === 'LONG' ? raw : -raw;
}

function costsFromGross(gross) {
  const taker = gross - (0.0010 + 0.0002);
  const maker = gross - (0.0004 + 0.0002);
  return {
    net_pct_taker: pct(taker),
    net_usd_taker: NOTIONAL_USD * taker,
    net_pct_maker: pct(maker),
    net_usd_maker: NOTIONAL_USD * maker,
    roi_on_capital_taker: (NOTIONAL_USD * taker / CAPITAL_USD) * 100,
    roi_on_capital_maker: (NOTIONAL_USD * maker / CAPITAL_USD) * 100,
  };
}

function quantiles(arr) {
  if (!arr.length) return { p25: null, p50: null, p75: null };
  const a = [...arr].sort((x, y) => x - y);
  const q = (p) => {
    const idx = (a.length - 1) * p;
    const lo = Math.floor(idx); const hi = Math.ceil(idx);
    if (lo === hi) return a[lo];
    const w = idx - lo; return a[lo] * (1 - w) + a[hi] * w;
  };
  return { p25: q(0.25), p50: q(0.5), p75: q(0.75) };
}

async function main() {
  const { signalsPath } = parseArgs();
  const { json: sigDoc } = signalsPath ? { json: JSON.parse(fs.readFileSync(signalsPath, 'utf8')) } : loadLatestSignalsJSON();
  const { symbol, timeframe, quantity, previousCandles } = sigDoc.params;

  // candles for H window
  const candles = await getData(symbol, quantity, undefined, previousCandles, timeframe);
  if (!candles || !candles.length) throw new Error('No candles');
  const atr = computeATR(candles, 14);

  const per = [];
  let wins = 0, losses = 0, expires = 0;
  let ties = 0, tp_first = 0, sl_first = 0;
  let netUsdTakerSum = 0, netUsdMakerSum = 0;
  const rrList = [];
  const dirList = []; const evtList = [];

  for (const s of sigDoc.signals) {
    const idx = candles.findIndex(c => c.openTimeISO === s.dtISO);
    if (idx < 0) throw new Error('Signal candle not found');
    const window = candles.slice(idx + 1, idx + 1 + H);
    if (window.length > H) throw new Error('ASSERT FAILED: looked beyond H');
    if (window.length === 0) throw new Error('Empty forward window');

    // Build asymmetric TP/SL only if missing
    let entry = s.entry;
    let sl = s.sl;
    let tp1 = s.tp1;
    let k_tp = null, k_sl = null, rr_target = null;
    if (!Number.isFinite(sl) || !Number.isFinite(tp1)) {
      if (!Number.isFinite(atr)) throw new Error('ATR required to synthesize TP/SL');
      // regime low: rr target from TP_MULTIPLIER
      const rrT = parseFloat(process.env.TP_MULTIPLIER) || 1.45;
      rr_target = rrT;
      // choose k_sl modest, k_tp = rrT * k_sl approximately
      k_sl = 0.8; k_tp = rrT * k_sl;
      if (s.side === 'LONG') {
        sl = entry - k_sl * atr;
        tp1 = entry + k_tp * atr;
      } else {
        sl = entry + k_sl * atr;
        tp1 = entry - k_tp * atr;
      }
    }

    // real distances
    const d = distancesAndRR(s.side, entry, sl, tp1);
    const rr_real = d.rr_real;
    rrList.push(rr_real);
    // theoretical gross pct at TP/SL
    const gross_tp = grossPct(s.side, entry, tp1) * 100;
    const gross_sl = grossPct(s.side, entry, sl) * 100;

    // exit evaluation and path
    const { exit, pathArr, tieCase, tieResolved } = evaluatePath(s.side, entry, sl, tp1, window);
    if (tieCase) ties += 1;
    if (pathArr.length) {
      const last = pathArr[pathArr.length - 1];
      if (last.hit === 'TP') tp_first += 1;
      if (last.hit === 'SL') sl_first += 1;
    }

    const g = grossPct(s.side, entry, exit.exit_price);
    if (exit.exit_reason === 'TP' && g <= 0) throw new Error('ASSERT FAILED: TP non-positive');
    if (exit.exit_reason === 'SL' && g >= 0) throw new Error('ASSERT FAILED: SL non-negative');

    // costs & ROI
    const costs = costsFromGross(g);
    netUsdTakerSum += costs.net_usd_taker;
    netUsdMakerSum += costs.net_usd_maker;

    if (exit.exit_reason === 'TP') wins += 1; else if (exit.exit_reason === 'SL') losses += 1; else expires += 1;

    // scores: real or null + flag
    let eventScore = Number.isFinite(s.eventScore) ? s.eventScore : null;
    let directionScore = Number.isFinite(s.directionScore) ? s.directionScore : null;
    const flags = [];
    if (eventScore === null || directionScore === null) flags.push('score:missing');
    if (eventScore !== null) evtList.push(eventScore);
    if (directionScore !== null) dirList.push(directionScore);

    // asserts
    if (Math.abs((d.tp1Pct / d.slPct) - rr_real) > 1e-6) throw new Error('ASSERT FAILED: rr_real mismatch with pct ratio');
    if (tieCase && exit.exit_reason !== 'SL') throw new Error('ASSERT FAILED: tie must resolve to SL');
    if (pathArr.length !== Math.min(H, window.length)) throw new Error('ASSERT FAILED: path length invalid');

    per.push({
      id: s.id,
      ts: s.dtISO,
      side: s.side,
      entry,
      sl,
      tp1,
      rr_target,
      rr_real,
      k_tp,
      k_sl,
      slPct: d.slPct,
      tp1Pct: d.tp1Pct,
      gross_pct_at_TP1: gross_tp,
      gross_pct_at_SL: gross_sl,
      exit_reason: exit.exit_reason,
      exit_price: exit.exit_price,
      bars_to_exit: exit.bars_to_exit,
      net_pct_taker: costs.net_pct_taker,
      net_usd_taker: costs.net_usd_taker,
      net_pct_maker: costs.net_pct_maker,
      net_usd_maker: costs.net_usd_maker,
      roi_on_capital_taker: costs.roi_on_capital_taker,
      roi_on_capital_maker: costs.roi_on_capital_maker,
      path: pathArr,
      tieCase,
      tieResolved,
      eventScore,
      directionScore,
      flags
    });
  }

  const n = per.length;
  if (n !== sigDoc.stats.total) throw new Error('ASSERT FAILED: per_signal length mismatch');
  // Numeric sanity
  for (const r of per) {
    ['rr_real','slPct','tp1Pct','net_pct_taker','net_usd_taker','net_pct_maker','net_usd_maker'].forEach(k => assertFinite(r[k], k));
  }

  const rr_avg = rrList.length ? rrList.reduce((a,b)=>a+b,0)/rrList.length : null;
  const rr_med = quantiles(rrList).p50;
  const dirStats = dirList.length ? { mean: dirList.reduce((a,b)=>a+b,0)/dirList.length, ...quantiles(dirList) } : { mean: null, ...{p25:null,p50:null,p75:null} };
  const evtStats = evtList.length ? { mean: evtList.reduce((a,b)=>a+b,0)/evtList.length, ...quantiles(evtList) } : { mean: null, ...{p25:null,p50:null,p75:null} };

  const win_rate = n ? wins / n : 0;
  const expectancy_taker = n ? (per.reduce((a,r)=>a+r.net_usd_taker,0) / n) : 0;

  const out = {
    version: 'v6.6.2b',
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
      rr_avg,
      rr_median: rr_med,
      scores: { event: evtStats, direction: dirStats },
      exit_audit: { ties, tp_first, sl_first, expires },
      net_usd_taker_sum: per.reduce((a,r)=>a+r.net_usd_taker,0),
      net_usd_maker_sum: per.reduce((a,r)=>a+r.net_usd_maker,0),
      expectancy_taker,
      expectancy_maker: n ? (per.reduce((a,r)=>a+r.net_usd_maker,0) / n) : 0,
      roi_on_capital_taker: (per.reduce((a,r)=>a+r.net_usd_taker,0) / CAPITAL_USD) * 100,
      roi_on_capital_maker: (per.reduce((a,r)=>a+r.net_usd_maker,0) / CAPITAL_USD) * 100
    },
    per_signal: per
  };

  const outPath = path.join('trades', 'reports', 'pnl_v6.6.2b.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`P&L_SUMMARY v6.6.2b | n=${n} | win%=${(win_rate*100).toFixed(2)} | exp=$${expectancy_taker.toFixed(2)} | rr_avg=${rr_avg?.toFixed(3)} | dir_mean=${dirStats.mean?.toFixed(3)} | ties=${ties} | out=${outPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };


