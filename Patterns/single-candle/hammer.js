/**
 * Hammer Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { calculateBodyRatio, calculateUpperWickRatio, calculateLowerWickRatio, isBullish } = require('../utils');

function detectHammer(candles, index) {
  if (index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle = candles[index];
  
  const bodyRatio = calculateBodyRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const lowerWickRatio = calculateLowerWickRatio(candle);
  
  // Hammer criteria:
  // 1. Small body at top of candle (body ratio < 30%)
  // 2. Long lower wick (lower wick > 60% of total range)
  // 3. Small upper wick (upper wick < 20% of total range)
  const hasSmallBody = bodyRatio <= 0.3;
  const hasLongLowerWick = lowerWickRatio >= 0.6;
  const hasSmallUpperWick = upperWickRatio <= 0.2;
  
  // Body should be at top of candle (close near high)
  // For hammer: body should be in upper 30% of the total range
  const bodyTop = Math.max(candle.open, candle.close);
  const bodyBottom = Math.min(candle.open, candle.close);
  const totalRange = candle.high - candle.low;
  const bodyPosition = (bodyTop - candle.low) / totalRange;
  const bodyAtTop = bodyPosition >= 0.7; // Body in upper 30% of range
  
  const match = hasSmallBody && hasLongLowerWick && hasSmallUpperWick && bodyAtTop;
  
  let confidence = 0;
  if (match) {
    // Calculate confidence based on how well it matches hammer criteria
    const bodyScore = Math.max(0, (0.3 - bodyRatio) / 0.3); // Higher score for smaller body
    const lowerWickScore = Math.min(1, lowerWickRatio / 0.6); // Higher score for longer lower wick
    const upperWickScore = Math.max(0, (0.2 - upperWickRatio) / 0.2); // Higher score for smaller upper wick
    
    confidence = (bodyScore + lowerWickScore + upperWickScore) / 3;
  }
  
  return {
    match,
    confidence,
    meta: {
      bodyRatio,
      upperWickRatio,
      lowerWickRatio,
      bodyAtTop,
      isBullish: isBullish(candle)
    }
  };
}

const spec = {
  name: "hammer",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Cuerpo pequeño arriba con mecha inferior larga, muestra rechazo a precios bajos.",
  typicalPrediction: "reversión alcista",
  commonContext: "en niveles de soporte o después de caídas, indica que el precio no quiere bajar más"
};

module.exports = {
  detectHammer,
  spec
};
