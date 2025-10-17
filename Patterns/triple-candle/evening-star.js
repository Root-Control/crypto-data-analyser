/**
 * Evening Star Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectEveningStar(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "evening-star",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Three candles: bullish, small body (star), bearish. Strong bearish reversal pattern.",
  typicalPrediction: "bearish reversal",
  commonContext: "after uptrends, showing exhaustion of buying pressure and potential trend reversal"
};

module.exports = {
  detectEveningStar,
  spec
};
