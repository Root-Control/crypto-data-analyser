/**
 * Rising Wedge Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectRisingWedge(candles, index, windowSize = 25) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "rising-wedge",
  type: "chart",
  minCandles: 25,
  shapeOnly: true,
  description: "Dos líneas ascendentes que convergen, patrón de reversión bajista.",
  typicalPrediction: "reversión bajista",
  commonContext: "después de subidas largas, indica que la fuerza alcista se está agotando"
};

module.exports = {
  detectRisingWedge,
  spec
};
