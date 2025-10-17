/**
 * Marubozu Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectMarubozu(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "marubozu",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Long candle with no or very small wicks, showing strong directional momentum.",
  typicalPrediction: "continuation of current trend",
  commonContext: "during strong trending moves, showing clear directional bias"
};

module.exports = {
  detectMarubozu,
  spec
};
