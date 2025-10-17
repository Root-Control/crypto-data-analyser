/**
 * Hanging Man Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { calculateBodyRatio, calculateUpperWickRatio, calculateLowerWickRatio, isBearish } = require('../utils');

function detectHangingMan(candles, index) {
  if (index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle = candles[index];
  
  const bodyRatio = calculateBodyRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const lowerWickRatio = calculateLowerWickRatio(candle);
  
  // Hanging Man criteria (similar to Hammer but bearish context):
  // 1. Small body at top of candle (body ratio < 30%)
  // 2. Long lower wick (lower wick > 60% of total range)
  // 3. Small upper wick (upper wick < 20% of total range)
  const hasSmallBody = bodyRatio <= 0.3;
  const hasLongLowerWick = lowerWickRatio >= 0.6;
  const hasSmallUpperWick = upperWickRatio <= 0.2;
  
  // Body should be at top of candle (close near high)
  // For hanging man: body should be in upper 30% of the total range
  const bodyTop = Math.max(candle.open, candle.close);
  const bodyBottom = Math.min(candle.open, candle.close);
  const totalRange = candle.high - candle.low;
  const bodyPosition = (bodyTop - candle.low) / totalRange;
  const bodyAtTop = bodyPosition >= 0.7; // Body in upper 30% of range
  
  const match = hasSmallBody && hasLongLowerWick && hasSmallUpperWick && bodyAtTop;
  
  let confidence = 0;
  if (match) {
    // Calculate confidence based on how well it matches hanging man criteria
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
      isBearish: isBearish(candle),
      bodyPosition
    }
  };
}

const spec = {
  name: "hanging-man",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Small body at top with long lower wick, showing potential weakness after uptrend.",
  typicalPrediction: "bearish reversal",
  commonContext: "after uptrends or at resistance levels, showing potential selling pressure"
};

module.exports = {
  detectHangingMan,
  spec
};
