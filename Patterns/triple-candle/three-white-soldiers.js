/**
 * Three White Soldiers Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectThreeWhiteSoldiers(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "three-white-soldiers",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Three consecutive bullish candles with progressively higher closes. Strong bullish continuation pattern.",
  typicalPrediction: "bullish continuation",
  commonContext: "during uptrends, showing strong and consistent buying pressure"
};

module.exports = {
  detectThreeWhiteSoldiers,
  spec
};
