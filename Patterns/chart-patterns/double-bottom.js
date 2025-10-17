/**
 * Double Bottom Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectDoubleBottom(candles, index, windowSize = 30) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "double-bottom",
  type: "chart-patterns",
  minCandles: 30,
  shapeOnly: true,
  description: "Two troughs at approximately the same price level with a peak between them. Bullish reversal pattern.",
  typicalPrediction: "bullish reversal",
  commonContext: "after a downtrend, when price fails to break below support twice"
};

module.exports = {
  detectDoubleBottom,
  spec
};
