/**
 * Falling Wedge Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectFallingWedge(candles, index, windowSize = 25) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "falling-wedge",
  type: "chart-patterns",
  minCandles: 25,
  shapeOnly: true,
  description: "Dos líneas descendentes que convergen, patrón de reversión alcista.",
  typicalPrediction: "reversión alcista",
  commonContext: "después de caídas largas, indica que la fuerza bajista se está agotando"
};

module.exports = {
  detectFallingWedge,
  spec
};
