/**
 * Three Outside Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectThreeOutside(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "three-outside",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Second candle engulfs first, third candle confirms direction. Strong reversal pattern.",
  typicalPrediction: "reversal (direction depends on engulfing direction)",
  commonContext: "at trend extremes, showing strong reversal momentum with confirmation"
};

module.exports = {
  detectThreeOutside,
  spec
};
