/**
 * Piercing Line Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectPiercingLine(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "piercing-line",
  type: "double-candle",
  minCandles: 2,
  shapeOnly: true,
  description: "Bullish candle that opens below previous bearish candle's low and closes above its midpoint. Bullish reversal pattern.",
  typicalPrediction: "bullish reversal",
  commonContext: "after downtrends or at support levels, showing strong buying interest"
};

module.exports = {
  detectPiercingLine,
  spec
};
