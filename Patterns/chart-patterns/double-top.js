/**
 * Double Top Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectDoubleTop(candles, index, windowSize = 30) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "double-top",
  type: "chart",
  minCandles: 30,
  shapeOnly: true,
  description: "Two peaks at approximately the same price level with a trough between them. Bearish reversal pattern.",
  typicalPrediction: "bearish reversal",
  commonContext: "after an uptrend, when price fails to break above resistance twice"
};

module.exports = {
  detectDoubleTop,
  spec
};
