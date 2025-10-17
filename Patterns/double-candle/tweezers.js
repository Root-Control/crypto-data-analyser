/**
 * Tweezers Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { isTweezers, isBullish, isBearish, calculatePriceTolerance } = require('../utils');

function detectTweezers(candles, index) {
  if (index + 1 >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index];
  const candle2 = candles[index + 1];

  const tweezersMatch = isTweezers(candle1, candle2);

  if (!tweezersMatch) {
    return { match: false, confidence: 0, meta: {} };
  }

  let tweezersType = 'unknown';
  let confidence = 0;

  // Check if both candles have similar highs (tweezer tops) or lows (tweezer bottoms)
  const highSimilarity = calculatePriceTolerance(candle1.high, candle2.high, 0.005); // 0.5% tolerance
  const lowSimilarity = calculatePriceTolerance(candle1.low, candle2.low, 0.005); // 0.5% tolerance

  if (highSimilarity) {
    tweezersType = 'top';
    confidence = 0.8;
  } else if (lowSimilarity) {
    tweezersType = 'bottom';
    confidence = 0.8;
  }

  // Higher confidence for opposite colored candles
  if ((isBullish(candle1) && isBearish(candle2)) || (isBearish(candle1) && isBullish(candle2))) {
    confidence = Math.min(1, confidence + 0.1);
  }

  return {
    match: true,
    confidence,
    meta: {
      tweezersType,
      highSimilarity,
      lowSimilarity,
      candle1Bullish: isBullish(candle1),
      candle2Bullish: isBullish(candle2),
      priceDifference: tweezersType === 'top' ? 
        Math.abs(candle1.high - candle2.high) : 
        Math.abs(candle1.low - candle2.low)
    }
  };
}

const spec = {
  name: "tweezers",
  type: "double-candle",
  minCandles: 2,
  shapeOnly: true,
  description: "Two candles with similar highs (tweezers top) or lows (tweezers bottom). Reversal pattern.",
  typicalPrediction: "reversal (tweezers top = bearish, tweezers bottom = bullish)",
  commonContext: "at key support/resistance levels, showing rejection at specific price levels"
};

module.exports = {
  detectTweezers,
  spec
};
