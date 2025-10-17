/**
 * Three Black Crows Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectThreeBlackCrows(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "three-black-crows",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Three consecutive bearish candles with progressively lower closes. Strong bearish continuation pattern.",
  typicalPrediction: "bearish continuation",
  commonContext: "during downtrends, showing strong and consistent selling pressure"
};

module.exports = {
  detectThreeBlackCrows,
  spec
};
