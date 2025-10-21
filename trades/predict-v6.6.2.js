require('dotenv').config();
const { getData } = require('./get-data');

function pct(a, b) {
  return (a - b) / b;
}

function fmtNumber(n, decimals = 2) {
  return Number(n.toFixed(decimals));
}

function computeATR(candles, period = 14) {
  if (candles.length < period + 1) return undefined;
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
  const atr = recent.reduce((a, b) => a + b, 0) / recent.length;
  return atr;
}

function buildSignal(idBase, candle, side, entry, sl, tp1, tp2, rr, eventScore, directionScore, votes, volumeRatio) {
  return {
    id: `${idBase}-${candle.openTime}`,
    dtISO: candle.openTimeISO,
    side,
    entry: fmtNumber(entry),
    sl: fmtNumber(sl),
    tp1: fmtNumber(tp1),
    tp2: tp2 !== undefined ? fmtNumber(tp2) : undefined,
    rr: fmtNumber(rr, 2),
    eventScore: fmtNumber(eventScore, 3),
    directionScore: fmtNumber(directionScore, 3),
    volumeRatio: fmtNumber(volumeRatio, 2),
    votes,
    targetsSource: 'atr',
    flags: [],
  };
}

async function predictV662({ symbol, quantity = 1000, fromISO, previousCandles = 500, timeframe = '15m', regime = 'low', maxSignalsPer1000 = 6 }) {
  const candles = await getData(symbol, quantity, fromISO, previousCandles, timeframe);
  if (!candles.length) return [];

  const allSignals = [];

  // Si quantity > 1000, dividir en chunks de 1000 velas
  if (quantity > 1000) {
    const chunkSize = 1000;
    const numChunks = Math.floor(quantity / chunkSize);
    
    console.log(`[predictV662] Dividiendo ${quantity} velas en ${numChunks} chunks de ${chunkSize} velas cada uno`);
    
    for (let chunk = 0; chunk < numChunks; chunk++) {
      const startIdx = chunk * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, candles.length);
      const chunkCandles = candles.slice(startIdx, endIdx);
      
      console.log(`[predictV662] Procesando chunk ${chunk + 1}/${numChunks}: velas ${startIdx}-${endIdx-1}`);
      
      const chunkSignals = processChunk(symbol, chunkCandles, previousCandles, maxSignalsPer1000, chunk);
      allSignals.push(...chunkSignals);
    }
    
    return allSignals.sort((a, b) => new Date(a.dtISO) - new Date(b.dtISO));
  } else {
    // Procesamiento normal para quantity <= 1000
    return processChunk(symbol, candles, previousCandles, maxSignalsPer1000, 0);
  }
}

function processChunk(symbol, candles, previousCandles, maxSignalsPer1000, chunkId) {
  const signals = [];

  // Simple placeholder selection: look for momentum bursts with ATR-filtered space
  const atr = computeATR(candles, 14) || 0;
  if (atr <= 0) return [];

  for (let i = previousCandles; i < candles.length; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];
    if (!p) continue;

    const change = pct(c.close, p.close);
    const range = c.high - c.low;
    const body = Math.abs(c.close - c.open);

    // naive momentum condition (to be replaced with v6.6.2 real scoring)
    const bullish = change > 0.002 && body > 0.5 * range;
    const bearish = change < -0.002 && body > 0.5 * range;

    if (!(bullish || bearish)) continue;

    const side = bullish ? 'LONG' : 'SHORT';
    const entry = c.close;
    const baseSl = bullish ? c.low : c.high;
    const rrTarget = parseFloat(process.env.TP_MULTIPLIER) || 1.0; // Use TP_MULTIPLIER from env
    const baseRisk = Math.abs(entry - baseSl);
    if (baseRisk <= 0) continue;
    
    // Apply multiplier to both SL and TP
    const multiplier = parseFloat(process.env.TP_MULTIPLIER) || 1.0;
    const adjustedRisk = baseRisk * multiplier;
    const sl = bullish ? entry - adjustedRisk : entry + adjustedRisk;
    const tp1 = bullish ? entry + rrTarget * adjustedRisk : entry - rrTarget * adjustedRisk;
    const tp2 = bullish ? entry + 2 * rrTarget * adjustedRisk : entry - 2 * rrTarget * adjustedRisk;
    const rr = Math.abs((tp1 - entry) / (entry - sl));

    const eventScore = Math.min(1, body / (atr || 1));
    const directionScore = Math.min(1, Math.abs(change) / 0.01); // Normalize to 0-1 range
    const volumeRatio = c.volume / (candles.slice(-20).reduce((sum, candle) => sum + candle.volume, 0) / 20); // 20-period avg
    const votes = { momentum: fmtNumber(directionScore, 3), book: 0.3, flow: 0.2, vwap: 0.1 };

    signals.push(buildSignal(symbol, c, side, entry, sl, tp1, tp2, rr, eventScore, directionScore, votes, volumeRatio));
  }

  // clustering rudimentary: keep top by composite score and enforce max count
  const withScore = signals.map(s => ({
    s,
    composite: 0.6 * s.eventScore + 0.3 * s.directionScore + 0.1 * (s.votes?.momentum ?? 0),
  }));
  withScore.sort((a, b) => b.composite - a.composite);
  
  const limited = withScore.slice(0, Math.min(maxSignalsPer1000, withScore.length)).map(x => x.s);
  
  console.log(`[predictV662] Chunk ${chunkId + 1}: ${signals.length} señales candidatas → ${limited.length} señales emitidas`);
  
  return limited;
}

module.exports = { predictV662 };
