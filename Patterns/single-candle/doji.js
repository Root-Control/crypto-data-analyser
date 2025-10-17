/**
 * Doji Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { isDoji, calculateBodyRatio, calculateUpperWickRatio, calculateLowerWickRatio } = require('../utils');

function detectDoji(candles, index) {
  if (index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle = candles[index];
  
  // Doji: open and close at nearly the same price (small body)
  const bodyRatio = calculateBodyRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const lowerWickRatio = calculateLowerWickRatio(candle);
  
  // Classic doji: body < 5% of total range
  const isClassicDoji = bodyRatio <= 0.05;
  
  // Dragonfly doji: long lower wick, no upper wick
  const isDragonflyDoji = bodyRatio <= 0.05 && lowerWickRatio > 0.6 && upperWickRatio <= 0.1;
  
  // Gravestone doji: long upper wick, no lower wick
  const isGravestoneDoji = bodyRatio <= 0.05 && upperWickRatio > 0.6 && lowerWickRatio <= 0.1;
  
  // Long-legged doji: long wicks on both sides
  const isLongLeggedDoji = bodyRatio <= 0.05 && upperWickRatio > 0.3 && lowerWickRatio > 0.3;
  
  const match = isClassicDoji || isDragonflyDoji || isGravestoneDoji || isLongLeggedDoji;
  
  let confidence = 0;
  let dojiType = 'classic';
  
  if (match) {
    if (isDragonflyDoji) {
      confidence = 0.9;
      dojiType = 'dragonfly';
    } else if (isGravestoneDoji) {
      confidence = 0.9;
      dojiType = 'gravestone';
    } else if (isLongLeggedDoji) {
      confidence = 0.8;
      dojiType = 'long-legged';
    } else {
      confidence = 0.7;
      dojiType = 'classic';
    }
  }
  
  return {
    match,
    confidence,
    meta: {
      bodyRatio,
      upperWickRatio,
      lowerWickRatio,
      dojiType
    }
  };
}

const spec = {
  name: "doji",
  type: "single-candle",
  minCandles: 1,
  shapeOnly: true,
  description: "Cuerpo muy pequeño, indica indecisión en el mercado.",
  typicalPrediction: "indecisión o reversión",
  commonContext: "en niveles clave de soporte/resistencia, muestra incertidumbre del mercado"
};

module.exports = {
  detectDoji,
  spec
};
