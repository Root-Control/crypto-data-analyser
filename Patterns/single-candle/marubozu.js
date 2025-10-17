/**
 * Marubozu Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { calculateBodyRatio, calculateUpperWickRatio, calculateLowerWickRatio, isBullish } = require('../utils');

function detectMarubozu(candles, index) {
  if (index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle = candles[index];
  
  const bodyRatio = calculateBodyRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const lowerWickRatio = calculateLowerWickRatio(candle);
  
  // Marubozu criteria:
  // 1. Large body (body ratio > 80%)
  // 2. Very small or no upper wick (upper wick < 5% of total range)
  // 3. Very small or no lower wick (lower wick < 5% of total range)
  const hasLargeBody = bodyRatio >= 0.8;
  const hasSmallUpperWick = upperWickRatio <= 0.05;
  const hasSmallLowerWick = lowerWickRatio <= 0.05;
  
  const match = hasLargeBody && hasSmallUpperWick && hasSmallLowerWick;
  
  let confidence = 0;
  if (match) {
    // Calculate confidence based on how well it matches marubozu criteria
    const bodyScore = Math.min(1, bodyRatio / 0.8); // Higher score for larger body
    const upperWickScore = Math.max(0, (0.05 - upperWickRatio) / 0.05); // Higher score for smaller upper wick
    const lowerWickScore = Math.max(0, (0.05 - lowerWickRatio) / 0.05); // Higher score for smaller lower wick
    
    confidence = (bodyScore + upperWickScore + lowerWickScore) / 3;
  }
  
  return {
    match,
    confidence,
    meta: {
      bodyRatio,
      upperWickRatio,
      lowerWickRatio,
      isBullish: isBullish(candle),
      bodySize: Math.abs(candle.close - candle.open)
    }
  };
}

const spec = {
  name: "marubozu",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Cuerpo grande sin mechas, muestra fuerte dirección.",
  typicalPrediction: "continuación fuerte",
  commonContext: "en tendencias fuertes, muestra convicción en la dirección del precio"
};

module.exports = {
  detectMarubozu,
  spec
};
