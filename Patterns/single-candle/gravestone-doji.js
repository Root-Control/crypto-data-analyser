/**
 * Gravestone Doji Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectGravestoneDoji(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "gravestone-doji",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Doji with long upper wick and no lower wick, showing rejection of higher prices.",
  typicalPrediction: "bearish reversal",
  commonContext: "at resistance levels, showing strong rejection of higher prices"
};

module.exports = {
  detectGravestoneDoji,
  spec
};
