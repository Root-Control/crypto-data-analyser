const Redis = require('ioredis');
const axios = require('axios');

const INTERVAL_MS = {
  '1m': 60_000,
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '2h': 2 * 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

function alignToIntervalStart(dateOrIso, timeframe) {
  const ms = typeof dateOrIso === 'string' ? Date.parse(dateOrIso) : dateOrIso;
  const interval = INTERVAL_MS[timeframe];
  if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`);
  return Math.floor(ms / interval) * interval;
}

function toISO(ms) {
  return new Date(ms).toISOString();
}

function toCandle(kline) {
  const [openTime, open, high, low, close, volume, closeTime] = [
    Number(kline[0]),
    Number(kline[1]),
    Number(kline[2]),
    Number(kline[3]),
    Number(kline[4]),
    Number(kline[5]),
    Number(kline[6]),
  ];
  return {
    openTime,
    openTimeISO: toISO(openTime),
    open,
    high,
    low,
    close,
    volume,
    closeTime: Number(closeTime),
  };
}

function dedupeAndSort(candles) {
  const map = new Map();
  for (const c of candles) {
    map.set(c.openTime, c);
  }
  return Array.from(map.values()).sort((a, b) => a.openTime - b.openTime);
}

async function fetchBinance(symbol, timeframe, params) {
  const url = 'https://fapi.binance.com/fapi/v1/continuousKlines';
  // Use Perpetual CONTRACT_TYPE=PERPETUAL; alternatively /klines for spot
  const query = new URLSearchParams({
    pair: symbol,
    contractType: 'PERPETUAL',
    interval: timeframe,
    limit: String(params.limit ?? 1000),
  });
  if (params.startTime) query.set('startTime', String(params.startTime));
  if (params.endTime) query.set('endTime', String(params.endTime));
  const { data } = await axios.get(`${url}?${query.toString()}`, { timeout: 15_000 });
  return data.map(toCandle);
}

function keys(symbol, timeframe) {
  const base = `${symbol}:${timeframe}`;
  return {
    DATA: `${base}:DATA`,
    LEN: `${base}:LEN`,
    FROM: `${base}:FROM`,
  };
}

async function loadCache(redis, k) {
  const [dataRaw, lenRaw, fromIso] = await redis.mget(k.DATA, k.LEN, k.FROM);
  if (!dataRaw || !lenRaw || !fromIso) return { candles: [], len: 0, fromIso: undefined };
  try {
    const candles = JSON.parse(dataRaw);
    return { candles, len: Number(lenRaw) || candles.length, fromIso };
  } catch {
    return { candles: [], len: 0, fromIso: undefined };
  }
}

async function persistCache(redis, k, candles) {
  const sorted = dedupeAndSort(candles);
  const len = sorted.length;
  const fromIso = len > 0 ? sorted[0].openTimeISO : undefined;
  await redis.multi()
    .set(k.DATA, JSON.stringify(sorted))
    .set(k.LEN, String(len))
    .set(k.FROM, fromIso ?? '')
    .exec();
  return { candles: sorted, len, fromIso };
}

async function backfill(symbol, timeframe, have, needRangeStart, needRangeEnd) {
  const interval = INTERVAL_MS[timeframe];
  const result = [...have];
  const haveMin = have.length ? have[0].openTime : Infinity;
  const haveMax = have.length ? have[have.length - 1].openTime : -Infinity;

  let binanceCalls = 0;
  const chunks = [];

  // Backfill backwards if needed
  if (needRangeStart < haveMin) {
    let endTime = have.length ? haveMin - interval : needRangeEnd; // when empty, start from desired end
    while (endTime >= needRangeStart - 1000) {
      const block = await fetchBinance(symbol, timeframe, { endTime, limit: 1000 });
      binanceCalls += 1;
      if (!block.length) break; // exhausted history
      chunks.push({ dir: 'back', from: block[0].openTime, to: block[block.length - 1].openTime, n: block.length });
      for (const c of block) result.push(c);
      endTime = block[0].openTime - interval;
      if (block[0].openTime <= needRangeStart) break;
    }
  }

  // Backfill forwards if needed
  const ensureHaveMax = () => (result.length ? dedupeAndSort(result)[result.length - 1].openTime : haveMax);
  if (needRangeEnd > ensureHaveMax()) {
    let startTime = ensureHaveMax() + interval;
    while (startTime <= needRangeEnd + 1000) {
      const block = await fetchBinance(symbol, timeframe, { startTime, limit: 1000 });
      binanceCalls += 1;
      if (!block.length) break; // no more data
      chunks.push({ dir: 'fwd', from: block[0].openTime, to: block[block.length - 1].openTime, n: block.length });
      for (const c of block) result.push(c);
      startTime = block[block.length - 1].openTime + interval;
      if (block[block.length - 1].openTime >= needRangeEnd) break;
    }
  }

  return { candles: dedupeAndSort(result), binanceCalls, chunks };
}

async function getData(symbol, quantity = 1000, fromISO = undefined, previousCandles = 0, timeframe = '15m', redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379') {
  const redis = new Redis(redisUrl);
  try {
    const need = quantity + previousCandles;
    const k = keys(symbol, timeframe);

    let cached = [];
    let cacheLEN = 0;
    let cacheFROM;
    try {
      const load = await loadCache(redis, k);
      cached = load.candles;
      cacheLEN = load.len;
      cacheFROM = load.fromIso;
    } catch (_) {
      cached = [];
      cacheLEN = 0;
      cacheFROM = undefined;
    }

    const interval = INTERVAL_MS[timeframe];
    if (!interval) throw new Error(`Unsupported timeframe: ${timeframe}`);

    let start;
    let end;

    if (fromISO) {
      const anchoredStart = alignToIntervalStart(fromISO, timeframe);
      end = anchoredStart; // El punto de referencia (fromISO)
      start = anchoredStart - (need - 1) * interval; // Hacia atrás desde fromISO
    } else {
      if (cacheLEN >= need) {
        const tail = cached.slice(-need);
        return tail;
      }
      const have = cached;
      const haveMax = have.length ? have[have.length - 1].openTime : Date.now();
      end = alignToIntervalStart(haveMax, timeframe);
      start = end - (need - 1) * interval;
    }

    const have = cached;
    const haveMin = have.length ? have[0].openTime : Infinity;
    const haveMax = have.length ? have[have.length - 1].openTime : -Infinity;

    let merged = have;
    let binanceCalls = 0;
    let chunks = [];

    const coversCompletely = haveMin <= start && haveMax >= end;
    if (!coversCompletely) {
      const backfilled = await backfill(symbol, timeframe, have, start, end);
      merged = backfilled.candles;
      binanceCalls = backfilled.binanceCalls;
      chunks = backfilled.chunks;
      try {
        await persistCache(redis, k, merged);
      } catch (_) {
        // ignore cache persist errors
      }
    }

    const sorted = dedupeAndSort(merged);
    let windowCandles;
    if (fromISO) {
      const byTime = new Map(sorted.map((c, idx) => [c.openTime, idx]));
      const startIdx = byTime.get(start);
      const endIdx = byTime.get(end);
      if (startIdx !== undefined && endIdx !== undefined) {
        windowCandles = sorted.slice(startIdx, endIdx + 1);
      } else {
        windowCandles = sorted.filter(c => c.openTime >= start && c.openTime <= end);
      }
    } else {
      windowCandles = sorted.slice(-need);
    }

    console.log('[getData] params', { symbol, timeframe, quantity, previousCandles, fromISO });
    console.log('[getData] metrics', { need, cacheLEN, cacheFROM, binanceCalls, chunks });

    return windowCandles;
  } finally {
    try { redis.disconnect(); } catch (_) {}
  }
}

module.exports = { getData };
