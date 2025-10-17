/**
 * Engulfing Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectEngulfing(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "engulfing",
  type: "double-candle",
  minCandles: 2,
  shapeOnly: true,
  description: "Second candle completely engulfs the body of the first candle. Strong reversal pattern.",
  typicalPrediction: "reversal (bullish if bullish engulfing, bearish if bearish engulfing)",
  commonContext: "at trend extremes or key support/resistance levels, showing strong reversal momentum"
};

module.exports = {
  detectEngulfing,
  spec
};
