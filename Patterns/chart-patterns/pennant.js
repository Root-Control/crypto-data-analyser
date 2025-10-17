/**
 * Pennant Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectPennant(candles, index, windowSize = 20) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "pennant",
  type: "chart",
  minCandles: 20,
  shapeOnly: true,
  description: "Consolidación triangular después de un movimiento fuerte.",
  typicalPrediction: "continuación de la tendencia",
  commonContext: "después de movimientos fuertes, indica pausa antes de continuar en la misma dirección"
};

module.exports = {
  detectPennant,
  spec
};
