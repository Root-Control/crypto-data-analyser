/**
 * Tasuki (Mat Hold) Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectTasukiMatHold(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "tasuki-mat-hold",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Patrón de cuatro velas que muestra consolidación en tendencia alcista.",
  typicalPrediction: "continuación alcista",
  commonContext: "en tendencias alcistas, indica pausa antes de continuar subiendo"
};

module.exports = {
  detectTasukiMatHold,
  spec
};
