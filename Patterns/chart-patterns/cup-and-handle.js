/**
 * Cup and Handle Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectCupAndHandle(candles, index, windowSize = 40) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "cup-and-handle",
  type: "chart-patterns",
  minCandles: 40,
  shapeOnly: true,
  description: "Forma de taza con asa, patrón de continuación alcista.",
  typicalPrediction: "ruptura alcista",
  commonContext: "después de correcciones, indica que el precio está preparándose para subir"
};

module.exports = {
  detectCupAndHandle,
  spec
};
