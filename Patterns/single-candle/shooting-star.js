/**
 * Shooting Star Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { calculateBodyRatio, calculateUpperWickRatio, calculateLowerWickRatio, isBearish } = require('../utils');

function detectShootingStar(candles, index) {
  if (index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle = candles[index];
  
  const bodyRatio = calculateBodyRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const lowerWickRatio = calculateLowerWickRatio(candle);
  
  // Shooting Star criteria:
  // 1. Small body at bottom of candle (body ratio < 30%)
  // 2. Long upper wick (upper wick > 60% of total range)
  // 3. Small lower wick (lower wick < 20% of total range)
  const hasSmallBody = bodyRatio <= 0.3;
  const hasLongUpperWick = upperWickRatio >= 0.6;
  const hasSmallLowerWick = lowerWickRatio <= 0.2;
  
  // Body should be at bottom of candle (close near low)
  // For shooting star: body should be in lower 30% of the total range
  const bodyTop = Math.max(candle.open, candle.close);
  const bodyBottom = Math.min(candle.open, candle.close);
  const totalRange = candle.high - candle.low;
  const bodyPosition = (bodyBottom - candle.low) / totalRange;
  const bodyAtBottom = bodyPosition <= 0.3; // Body in lower 30% of range
  
  const match = hasSmallBody && hasLongUpperWick && hasSmallLowerWick && bodyAtBottom;
  
  let confidence = 0;
  if (match) {
    // Calculate confidence based on how well it matches shooting star criteria
    const bodyScore = Math.max(0, (0.3 - bodyRatio) / 0.3); // Higher score for smaller body
    const upperWickScore = Math.min(1, upperWickRatio / 0.6); // Higher score for longer upper wick
    const lowerWickScore = Math.max(0, (0.2 - lowerWickRatio) / 0.2); // Higher score for smaller lower wick
    
    confidence = (bodyScore + upperWickScore + lowerWickScore) / 3;
  }
  
  return {
    match,
    confidence,
    meta: {
      bodyRatio,
      upperWickRatio,
      lowerWickRatio,
      bodyAtBottom,
      isBearish: isBearish(candle),
      bodyPosition
    }
  };
}

const spec = {
  name: "shooting-star",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Cuerpo pequeño abajo con mecha superior larga, muestra rechazo a precios altos.",
  typicalPrediction: "reversión bajista",
  commonContext: "en niveles de resistencia o después de subidas, indica que el precio no quiere subir más"
};

module.exports = {
  detectShootingStar,
  spec
};
