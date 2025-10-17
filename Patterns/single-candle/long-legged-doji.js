/**
 * Long Legged Doji Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectLongLeggedDoji(candles, index) {
  // TODO: Implement shape-only detection
  // Return: { match: boolean, confidence: number, meta: object }
  return {
    match: false,
    confidence: 0,
    meta: {}
  };
}

const spec = {
  name: "long-legged-doji",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Doji con mechas largas arriba y abajo, muestra máxima indecisión.",
  typicalPrediction: "indecisión extrema",
  commonContext: "en puntos de inflexión del mercado, muestra máxima incertidumbre"
};

module.exports = {
  detectLongLeggedDoji,
  spec
};
