/**
 * Doji Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectDoji(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "doji",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Candle with open and close at nearly the same price, showing market indecision.",
  typicalPrediction: "reversal or indecision",
  commonContext: "at key support/resistance levels, showing market uncertainty"
};

module.exports = {
  detectDoji,
  spec
};
