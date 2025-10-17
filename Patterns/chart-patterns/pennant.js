/**
 * Pennant Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectPennant(candles, index, windowSize = 20) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "pennant",
  type: "chart-patterns",
  minCandles: 20,
  shapeOnly: true,
  description: "Small triangular consolidation after a strong move, with converging support and resistance lines. Continuation pattern.",
  typicalPrediction: "continuation of previous trend",
  commonContext: "following a strong impulse move, showing brief triangular consolidation before resuming trend"
};

module.exports = {
  detectPennant,
  spec
};
