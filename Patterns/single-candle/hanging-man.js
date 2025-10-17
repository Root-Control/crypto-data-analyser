/**
 * Hanging Man Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectHangingMan(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
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
