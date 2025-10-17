/**
 * Tasuki (Mat Hold) Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectTasukiMatHold(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "tasuki-mat-hold",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Three candles with gap and hold pattern. Continuation pattern showing trend strength.",
  typicalPrediction: "continuation of trend",
  commonContext: "during strong trends, showing sustained directional momentum with minimal pullback"
};

module.exports = {
  detectTasukiMatHold,
  spec
};
