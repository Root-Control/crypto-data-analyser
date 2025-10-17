/**
 * Tweezers Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectTweezers(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
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
