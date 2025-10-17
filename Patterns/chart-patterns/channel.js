/**
 * Channel Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectChannel(candles, index, windowSize = 30) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "channel",
  type: "chart",
  minCandles: 30,
  shapeOnly: true,
  description: "Dos líneas paralelas que contienen el precio en una tendencia.",
  typicalPrediction: "continuación en la dirección del canal",
  commonContext: "en tendencias claras, indica que el precio respeta los límites del canal"
};

module.exports = {
  detectChannel,
  spec
};
