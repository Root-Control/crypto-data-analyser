/**
 * Hammer Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectHammer(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "hammer",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Small body at top with long lower wick, showing rejection of lower prices.",
  typicalPrediction: "bullish reversal",
  commonContext: "at support levels or after downtrends, showing rejection of lower prices"
};

module.exports = {
  detectHammer,
  spec
};
