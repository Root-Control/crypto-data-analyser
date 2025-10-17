/**
 * Three Outside Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectThreeOutside(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "three-outside",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Tres velas donde la del medio engulle a las otras dos.",
  typicalPrediction: "reversión fuerte",
  commonContext: "en cambios de tendencia, muestra que una dirección está dominando"
};

module.exports = {
  detectThreeOutside,
  spec
};
