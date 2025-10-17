/**
 * Flag Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectFlag(candles, index, windowSize = 20) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "flag",
  type: "chart",
  minCandles: 20,
  shapeOnly: true,
  description: "Small rectangular consolidation after a strong move, with parallel support and resistance lines. Continuation pattern.",
  typicalPrediction: "continuation of previous trend",
  commonContext: "following a strong impulse move, showing brief consolidation before resuming trend"
};

module.exports = {
  detectFlag,
  spec
};
