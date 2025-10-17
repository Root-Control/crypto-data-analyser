/**
 * Spinning Top Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { calculateBodyRatio, calculateUpperWickRatio, calculateLowerWickRatio } = require('../utils');

function detectSpinningTop(candles, index) {
  if (index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle = candles[index];
  
  const bodyRatio = calculateBodyRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const lowerWickRatio = calculateLowerWickRatio(candle);
  
  // Spinning Top criteria:
  // 1. Small body (body ratio < 30%)
  // 2. Long upper wick (upper wick > 30% of total range)
  // 3. Long lower wick (lower wick > 30% of total range)
  const hasSmallBody = bodyRatio <= 0.3;
  const hasLongUpperWick = upperWickRatio >= 0.3;
  const hasLongLowerWick = lowerWickRatio >= 0.3;
  
  const match = hasSmallBody && hasLongUpperWick && hasLongLowerWick;
  
  let confidence = 0;
  if (match) {
    // Calculate confidence based on how well it matches spinning top criteria
    const bodyScore = Math.max(0, (0.3 - bodyRatio) / 0.3); // Higher score for smaller body
    const upperWickScore = Math.min(1, upperWickRatio / 0.3); // Higher score for longer upper wick
    const lowerWickScore = Math.min(1, lowerWickRatio / 0.3); // Higher score for longer lower wick
    
    confidence = (bodyScore + upperWickScore + lowerWickScore) / 3;
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
  name: "spinning-top",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Cuerpo pequeño con mechas largas, muestra indecisión.",
  typicalPrediction: "indecisión",
  commonContext: "en mercados laterales, muestra lucha entre compradores y vendedores"
};

module.exports = {
  detectSpinningTop,
  spec
};
