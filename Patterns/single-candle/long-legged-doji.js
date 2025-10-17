/**
 * Long Legged Doji Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectLongLeggedDoji(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "long-legged-doji",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Doji with long upper and lower wicks, showing high volatility and indecision.",
  typicalPrediction: "high volatility, potential reversal",
  commonContext: "during high volatility periods, showing extreme market indecision"
};

module.exports = {
  detectLongLeggedDoji,
  spec
};
