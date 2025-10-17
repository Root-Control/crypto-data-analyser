/**
 * Three Inside Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectThreeInside(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "three-inside",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Tres velas donde la del medio está dentro de las otras dos.",
  typicalPrediction: "reversión o consolidación",
  commonContext: "después de movimientos fuertes, indica que el momentum se está agotando"
};

module.exports = {
  detectThreeInside,
  spec
};
