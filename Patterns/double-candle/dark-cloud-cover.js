/**
 * Dark Cloud Cover Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectDarkCloudCover(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "dark-cloud-cover",
  type: "double-candle",
  minCandles: 2,
  shapeOnly: true,
  description: "Bearish candle that opens above previous bullish candle's high and closes below its midpoint. Bearish reversal pattern.",
  typicalPrediction: "bearish reversal",
  commonContext: "after uptrends or at resistance levels, showing strong selling pressure"
};

module.exports = {
  detectDarkCloudCover,
  spec
};
