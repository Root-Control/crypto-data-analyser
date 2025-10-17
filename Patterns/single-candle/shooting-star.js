/**
 * Shooting Star Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectShootingStar(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "shooting-star",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Small body at bottom with long upper wick, showing rejection of higher prices.",
  typicalPrediction: "bearish reversal",
  commonContext: "after uptrends or at resistance levels, showing rejection of higher prices"
};

module.exports = {
  detectShootingStar,
  spec
};
