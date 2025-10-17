/**
 * Rectangle Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectRectangle(candles, index, windowSize = 20) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "rectangle",
  type: "chart",
  minCandles: 20,
  shapeOnly: true,
  description: "Rango lateral con soporte y resistencia claros.",
  typicalPrediction: "ruptura en cualquier dirección",
  commonContext: "en mercados laterales, indica que el precio está atrapado entre dos niveles"
};

module.exports = {
  detectRectangle,
  spec
};
