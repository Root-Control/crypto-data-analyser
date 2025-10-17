/**
 * Gravestone Doji Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { calculateBodyRatio, calculateUpperWickRatio, calculateLowerWickRatio } = require('../utils');

function detectGravestoneDoji(candles, index) {
  if (index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle = candles[index];
  
  const bodyRatio = calculateBodyRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const lowerWickRatio = calculateLowerWickRatio(candle);
  
  // Gravestone Doji criteria:
  // 1. Very small body (body ratio <= 5%)
  // 2. Very long upper wick (upper wick > 60% of total range)
  // 3. Very small or no lower wick (lower wick <= 10% of total range)
  const hasVerySmallBody = bodyRatio <= 0.05;
  const hasLongUpperWick = upperWickRatio >= 0.6;
  const hasSmallLowerWick = lowerWickRatio <= 0.1;
  
  const match = hasVerySmallBody && hasLongUpperWick && hasSmallLowerWick;
  
  let confidence = 0;
  if (match) {
    // Calculate confidence based on how well it matches gravestone doji criteria
    const bodyScore = Math.max(0, (0.05 - bodyRatio) / 0.05); // Higher score for smaller body
    const upperWickScore = Math.min(1, upperWickRatio / 0.6); // Higher score for longer upper wick
    const lowerWickScore = Math.max(0, (0.1 - lowerWickRatio) / 0.1); // Higher score for smaller lower wick
    
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
  name: "gravestone-doji",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Doji with long upper wick and no lower wick, showing rejection of higher prices.",
  typicalPrediction: "bearish reversal",
  commonContext: "at resistance levels, showing strong rejection of higher prices"
};

module.exports = {
  detectGravestoneDoji,
  spec
};
