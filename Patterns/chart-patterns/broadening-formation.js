/**
 * Broadening Formation Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectBroadeningFormation(candles, index, windowSize = 30) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "broadening-formation",
  type: "chart",
  minCandles: 30,
  shapeOnly: true,
  description: "Dos líneas divergentes que amplían el rango, indica volatilidad creciente.",
  typicalPrediction: "ruptura en cualquier dirección",
  commonContext: "en mercados volátiles, indica que la incertidumbre está aumentando"
};

module.exports = {
  detectBroadeningFormation,
  spec
};
