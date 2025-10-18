/**
 * Harami Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { isHarami, isBullish, isBearish, calculateBodySize } = require('../utils');

function detectHarami(candles, index) {
  // Detect AFTER the second candle has occurred
  if (index < 1 || index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index - 1];  // First candle (1 period ago)
  const candle2 = candles[index];      // Second candle (current/just completed)

  const haramiMatch = isHarami(candle1, candle2);

  if (!haramiMatch) {
    return { match: false, confidence: 0, meta: {} };
  }

  let haramiType = 'unknown';
  let confidence = 0;

  if (isBullish(candle2) && isBearish(candle1)) {
    haramiType = 'bullish';
    confidence = 0.8;
  } else if (isBearish(candle2) && isBullish(candle1)) {
    haramiType = 'bearish';
    confidence = 0.8;
  }

  const body1Size = calculateBodySize(candle1);
  const body2Size = calculateBodySize(candle2);
  const bodyRatio = body2Size / body1Size;

  // Higher confidence for smaller harami body relative to first candle
  if (bodyRatio < 0.5) {
    confidence = Math.min(1, confidence + 0.1);
  }

  return {
    match: true,
    confidence,
    meta: {
      haramiType,
      body1Size,
      body2Size,
      bodyRatio,
      candle1Bullish: isBullish(candle1),
      candle2Bullish: isBullish(candle2)
    }
  };
}

const spec = {
  name: "harami",
  type: "double-candle",
  minCandles: 2,
  shapeOnly: true,
  description: "Una vela pequeña está dentro del cuerpo de la vela anterior grande.",
  typicalPrediction: "reversión o pausa",
  commonContext: "después de movimientos fuertes, indica que la tendencia se está agotando"
};

module.exports = {
  detectHarami,
  spec
};
