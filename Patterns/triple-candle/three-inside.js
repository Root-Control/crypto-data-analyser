/**
 * Three Inside Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectThreeInside(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "three-inside",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Third candle contained within the range of the second candle, which is contained within the first. Consolidation pattern.",
  typicalPrediction: "continuation of trend",
  commonContext: "after strong moves, showing consolidation before potential trend continuation"
};

module.exports = {
  detectThreeInside,
  spec
};
