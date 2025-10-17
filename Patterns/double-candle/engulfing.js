/**
 * Engulfing Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { isEngulfing, isBullish, isBearish, calculateBodySize } = require('../utils');

function detectEngulfing(candles, index) {
  if (index + 1 >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index];
  const candle2 = candles[index + 1];
  
  // Check if candle2 engulfs candle1
  const engulfingMatch = isEngulfing(candle1, candle2);
  
  if (!engulfingMatch) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Determine engulfing type
  let engulfingType = 'unknown';
  let confidence = 0;
  
  if (isBullish(candle2) && isBearish(candle1)) {
    engulfingType = 'bullish';
    confidence = 0.8;
  } else if (isBearish(candle2) && isBullish(candle1)) {
    engulfingType = 'bearish';
    confidence = 0.8;
  }
  
  // Calculate body size ratio for additional confidence
  const body1Size = calculateBodySize(candle1);
  const body2Size = calculateBodySize(candle2);
  const bodyRatio = body2Size / body1Size;
  
  // Higher confidence for larger engulfing
  if (bodyRatio > 2) {
    confidence = Math.min(1, confidence + 0.1);
  }
  
  return {
    match: true,
    confidence,
    meta: {
      engulfingType,
      body1Size,
      body2Size,
      bodyRatio,
      candle1Bullish: isBullish(candle1),
      candle2Bullish: isBullish(candle2)
    }
  };
}

const spec = {
  name: "engulfing",
  type: "double-candle",
  minCandles: 2,
  shapeOnly: true,
  description: "Una vela grande 'engulle' completamente a la vela anterior pequeña.",
  typicalPrediction: "reversión (alcista si verde engulle roja, bajista si roja engulle verde)",
  commonContext: "al final de una tendencia, indica cambio fuerte en el momentum"
};

module.exports = {
  detectEngulfing,
  spec
};
