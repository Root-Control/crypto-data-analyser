/**
 * Diamond Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectDiamond(candles, index, windowSize = 30) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "diamond",
  type: "chart-patterns",
  minCandles: 30,
  shapeOnly: true,
  description: "Forma de diamante, patrón de reversión.",
  typicalPrediction: "reversión de tendencia",
  commonContext: "al final de tendencias largas, indica que la dirección está cambiando"
};

module.exports = {
  detectDiamond,
  spec
};
