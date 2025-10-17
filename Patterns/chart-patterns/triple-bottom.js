/**
 * Triple Bottom Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectTripleBottom(candles, index, windowSize = 40) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "triple-bottom",
  type: "chart-patterns",
  minCandles: 40,
  shapeOnly: true,
  description: "Tres valles similares, patrón de reversión alcista.",
  typicalPrediction: "reversión alcista",
  commonContext: "después de intentos múltiples de romper soporte, indica debilidad bajista"
};

module.exports = {
  detectTripleBottom,
  spec
};
