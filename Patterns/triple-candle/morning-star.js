/**
 * Morning Star Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectMorningStar(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "morning-star",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Three candles: bearish, small body (star), bullish. Strong bullish reversal pattern.",
  typicalPrediction: "bullish reversal",
  commonContext: "after downtrends, showing exhaustion of selling pressure and potential trend reversal"
};

module.exports = {
  detectMorningStar,
  spec
};
