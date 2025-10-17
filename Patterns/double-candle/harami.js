/**
 * Harami Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectHarami(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "harami",
  type: "double-candle",
  minCandles: 2,
  shapeOnly: true,
  description: "Small second candle contained within the body of the first large candle. Reversal pattern.",
  typicalPrediction: "reversal (weaker than engulfing)",
  commonContext: "after strong moves, showing potential trend exhaustion and reversal"
};

module.exports = {
  detectHarami,
  spec
};
