/**
 * Dragonfly Doji Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { calculateBodyRatio, calculateUpperWickRatio, calculateLowerWickRatio } = require('../utils');

function detectDragonflyDoji(candles, index) {
  if (index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle = candles[index];
  
  const bodyRatio = calculateBodyRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const lowerWickRatio = calculateLowerWickRatio(candle);
  
  // Dragonfly Doji criteria:
  // 1. Very small body (body ratio <= 5%)
  // 2. Very long lower wick (lower wick > 60% of total range)
  // 3. Very small or no upper wick (upper wick <= 10% of total range)
  const hasVerySmallBody = bodyRatio <= 0.05;
  const hasLongLowerWick = lowerWickRatio >= 0.6;
  const hasSmallUpperWick = upperWickRatio <= 0.1;
  
  const match = hasVerySmallBody && hasLongLowerWick && hasSmallUpperWick;
  
  let confidence = 0;
  if (match) {
    // Calculate confidence based on how well it matches dragonfly criteria
    const bodyScore = Math.max(0, (0.05 - bodyRatio) / 0.05); // Higher score for smaller body
    const lowerWickScore = Math.min(1, lowerWickRatio / 0.6); // Higher score for longer lower wick
    const upperWickScore = Math.max(0, (0.1 - upperWickRatio) / 0.1); // Higher score for smaller upper wick
    
    confidence = (bodyScore + lowerWickScore + upperWickScore) / 3;
  }
  
  return {
    match,
    confidence,
    meta: {
      bodyRatio,
      upperWickRatio,
      lowerWickRatio,
      bodySize: Math.abs(candle.close - candle.open)
    }
  };
}

const spec = {
  name: "dragonfly-doji",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Doji con mecha inferior larga y sin mecha superior, muestra rechazo a precios bajos.",
  typicalPrediction: "reversión alcista",
  commonContext: "en niveles de soporte, muestra fuerte rechazo a precios más bajos"
};

module.exports = {
  detectDragonflyDoji,
  spec
};
