/**
 * Spinning Top Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectSpinningTop(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "spinning-top",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Small body with wicks on both sides, showing indecision between buyers and sellers.",
  typicalPrediction: "indecision, potential reversal",
  commonContext: "after trending moves, showing balance between buyers and sellers"
};

module.exports = {
  detectSpinningTop,
  spec
};
