/**
 * Inverted Hammer Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectInvertedHammer(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "inverted-hammer",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Cuerpo pequeño abajo con mecha superior larga, muestra potencial de reversión alcista.",
  typicalPrediction: "reversión alcista",
  commonContext: "después de caídas o en soporte, indica que el precio quiere subir"
};

module.exports = {
  detectInvertedHammer,
  spec
};
