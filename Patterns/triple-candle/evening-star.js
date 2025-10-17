/**
 * Evening Star Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { isBearish, isBullish, calculateBodySize, calculateBodyRatio } = require('../utils');

function detectEveningStar(candles, index) {
  if (index + 2 >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index];     // First bullish candle
  const candle2 = candles[index + 1]; // Small doji/gap candle
  const candle3 = candles[index + 2]; // Bearish candle

  // Evening Star criteria:
  // 1. First candle: bullish
  // 2. Second candle: small body (doji-like) with gap
  // 3. Third candle: bearish that closes into first candle's body
  
  if (!isBullish(candle1)) {
    return { match: false, confidence: 0, meta: {} };
  }

  if (!isBearish(candle3)) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Second candle should have small body (doji-like)
  const candle2BodyRatio = calculateBodyRatio(candle2);
  if (candle2BodyRatio > 0.3) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Check for gap between first and second candle
  const gapUp = candle2.low > candle1.close;
  if (!gapUp) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Third candle should close into first candle's body (at least 50%)
  const candle1BodyTop = Math.max(candle1.open, candle1.close);
  const candle1BodyBottom = Math.min(candle1.open, candle1.close);
  const candle3Close = candle3.close;
  
  const closesIntoBody = candle3Close >= candle1BodyBottom && 
                        candle3Close <= candle1BodyTop;

  if (!closesIntoBody) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence
  const bodySize1 = calculateBodySize(candle1);
  const bodySize3 = calculateBodySize(candle3);
  const bodyRatio = bodySize3 / bodySize1;
  
  let confidence = 0.7;
  
  // Higher confidence for larger third candle relative to first
  if (bodyRatio > 1.2) {
    confidence += 0.1;
  }
  
  // Higher confidence for smaller middle candle
  if (candle2BodyRatio < 0.1) {
    confidence += 0.1;
  }

  confidence = Math.min(1, confidence);

  return {
    match: true,
    confidence,
    meta: {
      candle1BodySize: bodySize1,
      candle2BodyRatio,
      candle3BodySize: bodySize3,
      bodyRatio,
      gapSize: candle2.low - candle1.close,
      closesIntoBody
    }
  };
}

const spec = {
  name: "evening-star",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Verde → Doji → Roja, con gaps, indica fin de subida.",
  typicalPrediction: "reversión bajista",
  commonContext: "después de subidas fuertes, indica que los vendedores están entrando"
};

module.exports = {
  detectEveningStar,
  spec
};
