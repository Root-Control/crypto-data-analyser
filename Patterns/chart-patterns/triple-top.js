/**
 * Triple Top Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectTripleTop(candles, index, windowSize = 40) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "triple-top",
  type: "chart",
  minCandles: 40,
  shapeOnly: true,
  description: "Tres picos similares, patrón de reversión bajista.",
  typicalPrediction: "reversión bajista",
  commonContext: "después de intentos múltiples de romper resistencia, indica debilidad alcista"
};

module.exports = {
  detectTripleTop,
  spec
};
