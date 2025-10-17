/**
 * Dragonfly Doji Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectDragonflyDoji(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "dragonfly-doji",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Doji with long lower wick and no upper wick, showing rejection of lower prices.",
  typicalPrediction: "bullish reversal",
  commonContext: "at support levels, showing strong rejection of lower prices"
};

module.exports = {
  detectDragonflyDoji,
  spec
};
