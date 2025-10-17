/**
 * Rectangle Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectRectangle(candles, index, windowSize = 20) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "rectangle",
  type: "chart-patterns",
  minCandles: 20,
  shapeOnly: true,
  description: "Horizontal trading range with parallel support and resistance lines. Neutral continuation pattern.",
  typicalPrediction: "continuation (direction depends on breakout)",
  commonContext: "during consolidation, showing balance between buyers and sellers at specific levels"
};

module.exports = {
  detectRectangle,
  spec
};
