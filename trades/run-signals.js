#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { predictV662 } = require('./predict-v6.6.2');
const { getData } = require('./get-data');
const { generatePdf } = require('./generate-pdf');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { symbol: 'ETHUSDT', timeframe: '15m', quantity: 1000, previousCandles: 500, regime: 'low', fromISO: undefined };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const v = args[i + 1];
    if (a === '--symbol') out.symbol = v;
    if (a === '--timeframe') out.timeframe = v;
    if (a === '--quantity') out.quantity = Number(v);
    if (a === '--previous') out.previousCandles = Number(v);
    if (a === '--from') out.fromISO = v;
    if (a === '--regime') out.regime = v;
  }
  return out;
}

function attachCandle(candles, s) {
  const idx = candles.findIndex(c => c.openTimeISO === s.dtISO);
  if (idx >= 0) s.candle = candles[idx];
  s._candleIdx = idx;
  return s;
}

function computeFeesAndRisk(s) {
  const capital = 400;
  const leverage = 10;
  const positionUSD = capital * leverage;
  const riskUSD = positionUSD * Math.abs((s.entry - s.sl) / s.entry);
  const grossUSD = positionUSD * Math.abs((s.tp1 - s.entry) / s.entry);
  const takerFees = positionUSD * 0.0005;
  const makerFees = positionUSD * 0.0002;
  const slippage = positionUSD * 0.0002;
  const netTakerUSD = grossUSD - takerFees - slippage;
  const netMakerUSD = grossUSD - makerFees - slippage;
  const roiTaker = (netTakerUSD / capital) * 100;
  const roiMaker = (netMakerUSD / capital) * 100;

  s.risk = { riskUSD, gainUSD: grossUSD, rr: Math.abs((s.tp1 - s.entry) / (s.entry - s.sl)) };
  s.fees = { positionUSD, grossUSD, takerFees, makerFees, slippage, netTakerUSD, netMakerUSD, roiTaker, roiMaker, minNetUsd: Math.min(netTakerUSD, netMakerUSD) };

  s.slPct = ((s.entry - s.sl) / s.entry) * 100 * (s.side === 'LONG' ? 1 : -1);
  s.tp1Pct = ((s.tp1 - s.entry) / s.entry) * 100 * (s.side === 'LONG' ? 1 : -1);
  if (typeof s.tp2 === 'number') s.tp2Pct = ((s.tp2 - s.entry) / s.entry) * 100 * (s.side === 'LONG' ? 1 : -1);
  return s;
}

function computeNextMove(candles, s) {
  if (s._candleIdx === undefined || s._candleIdx < 0) return s;
  const next = candles[s._candleIdx + 1];
  if (!next) return s;
  const entry = s.entry;
  const up1Pct = ((next.high - entry) / entry) * 100;
  const down1Pct = ((entry - next.low) / entry) * 100;
  const wickLow = Math.max(0, entry - next.low);
  const wickLowPct = (wickLow / entry) * 100;
  const closeDeltaPct = ((next.close - entry) / entry) * 100;
  s.moveNext = { up1Pct, down1Pct, wickLow, wickLowPct, closeDeltaPct };
  return s;
}

async function main() {
  const opts = parseArgs();
  const { symbol, timeframe, quantity, previousCandles, fromISO, regime } = opts;
  const candles = await getData(symbol, quantity, fromISO, previousCandles, timeframe);
  const signals = (await predictV662({ symbol, quantity, fromISO, previousCandles, timeframe, regime }))
    .map(s => attachCandle(candles, s))
    .map(s => computeFeesAndRisk(s))
    .map(s => computeNextMove(candles, s));

  const reportsDir = path.join('trades', 'reports');
  ensureDir(reportsDir);

  const snapshot = {
    version: 'v6.6.2',
    regime,
    params: { symbol, timeframe, quantity, previousCandles, fromISO },
    stats: { total: signals.length },
    signals,
  };

  const jsonOut = path.join(reportsDir, `signals-${Date.now()}.json`);
  fs.writeFileSync(jsonOut, JSON.stringify(snapshot, null, 2));

  const pdfOut = path.join(reportsDir, 'signals.pdf');
  const dateRange = candles.length ? { from: candles[0].openTime, to: candles[candles.length - 1].openTime } : undefined;
  await generatePdf({ signals, regime, symbol, dateRange, outPath: pdfOut });

  // Minimal sanity logs aligned with v6.6.2 prompt
  const dirAvg = signals.length ? signals.reduce((a, s) => a + (s.directionScore || 0), 0) / signals.length : 0;
  console.log(`EMIT_SUMMARY v6.6.2 | picked=${signals.length} | emitted=${signals.length} | postCluster=${signals.length} | dirAvgEmit=${dirAvg.toFixed(3)}`);

  console.log('Generated:', { jsonOut, pdfOut, total: signals.length });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
