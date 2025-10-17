// get-15m-futures-klines-console.js
// Uso:
//   node get-15m-futures-klines-console.js ETHUSDT "2025-10-17 10:30" -300
//   node get-15m-futures-klines-console.js BTCUSDT "2025-10-17T10:30-05:00"
//
// Args:
//  1) symbol        -> ej: ETHUSDT (contratos USDⓈ-M)
//  2) fecha/hora    -> "YYYY-MM-DD HH:mm" (hora local) o ISO "YYYY-MM-DDTHH:mm±HH:mm" / "Z"
//  3) offset minutos (opcional) -> respecto a UTC; por defecto -300 (Lima UTC-5)
//
// Nota: Futures también usa timestamps en UTC.

const DEFAULT_OFFSET_MIN = -300; // Lima (UTC-5)

function isISOWithZone(str) {
  return /Z$|[+\-]\d{2}:\d{2}$/.test(str);
}

function parseToUTCms(dateStr, offsetMinutes = DEFAULT_OFFSET_MIN) {
  if (isISOWithZone(dateStr)) {
    const t = Date.parse(dateStr);
    if (Number.isNaN(t)) throw new Error('Fecha ISO inválida');
    return t;
  }
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) throw new Error('Formato inválido. Usa "YYYY-MM-DD HH:mm" o ISO con zona.');
  const [_, y, mo, d, h, mi] = m.map(Number);
  const localMs = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  return localMs - offsetMinutes * 60 * 1000;
}

function klineArrayToObj(k) {
  return {
    openTime: k[0],
    openTimeISO: new Date(k[0]).toISOString(),
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: k[5],
    closeTime: k[6],
    closeTimeISO: new Date(k[6]).toISOString(),
    trades: k[8],
    takerBuyBaseVolume: k[9],
    takerBuyQuoteVolume: k[10],
  };
}

async function getLast50Klines15mUntil(symbol, untilUtcMs) {
  const params = new URLSearchParams({
    symbol,
    interval: '15m',
    endTime: String(untilUtcMs),
    limit: '20',
  });
  const url = `https://fapi.binance.com/fapi/v1/klines?${params.toString()}`; // FUTURES USD-M
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Binance Futures error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return data.map(klineArrayToObj);
}

(async () => {
  try {
    const symbol = process.argv[2] || 'ETHUSDT';
    const dateStr = process.argv[3] || '2025-10-17 10:30';
    const offsetMin = Number.isFinite(Number(process.argv[4]))
      ? Number(process.argv[4])
      : DEFAULT_OFFSET_MIN;

    const untilUtcMs = parseToUTCms(dateStr, offsetMin);
    const klines = await getLast50Klines15mUntil(symbol, untilUtcMs);

    console.log('=== Binance Futures (USD-M) 15m klines ===');
    console.log('symbol:', symbol);
    console.log('interval: 15m');
    console.log('requested:', dateStr);
    console.log('offsetMinutes:', isISOWithZone(dateStr) ? '(desde ISO)' : offsetMin);
    console.log('untilUtcISO:', new Date(untilUtcMs).toISOString());
    console.log('count:', klines.length);
    console.log('first:', klines[0]?.openTimeISO, 'last:', klines.at(-1)?.closeTimeISO);
    console.log('--- candles ---');
    console.log(JSON.stringify(klines, null, 2));
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  }
})();
