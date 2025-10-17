/**
 * Inverted Hammer Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectInvertedHammer(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "inverted-hammer",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Small body at bottom with long upper wick, showing rejection of higher prices.",
  typicalPrediction: "bullish reversal (with confirmation)",
  commonContext: "at support levels or after downtrends, showing potential buying interest"
};

module.exports = {
  detectInvertedHammer,
  spec
};
