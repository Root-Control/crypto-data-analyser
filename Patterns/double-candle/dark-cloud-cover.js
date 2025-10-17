/**
 * Dark Cloud Cover Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { isBearish, isBullish, calculateBodySize } = require('../utils');

function detectDarkCloudCover(candles, index) {
  if (index + 1 >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index];     // Bullish candle
  const candle2 = candles[index + 1]; // Bearish candle

  // Dark Cloud Cover criteria:
  // 1. First candle: bullish
  // 2. Second candle: bearish
  // 3. Second candle opens above first candle's high
  // 4. Second candle closes below midpoint of first candle's body
  
  if (!isBullish(candle1)) {
    return { match: false, confidence: 0, meta: {} };
  }

  if (!isBearish(candle2)) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Second candle should open above first candle's high
  if (candle2.open <= candle1.high) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate first candle's body midpoint
  const candle1BodyTop = Math.max(candle1.open, candle1.close);
  const candle1BodyBottom = Math.min(candle1.open, candle1.close);
  const candle1BodyMidpoint = (candle1BodyTop + candle1BodyBottom) / 2;

  // Second candle should close below first candle's body midpoint
  if (candle2.close >= candle1BodyMidpoint) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence
  const bodySize1 = calculateBodySize(candle1);
  const bodySize2 = calculateBodySize(candle2);
  const penetrationRatio = (candle1BodyMidpoint - candle2.close) / (candle1BodyTop - candle1BodyBottom);
  
  let confidence = 0.7;
  
  // Higher confidence for larger penetration
  if (penetrationRatio > 0.5) {
    confidence += 0.1;
  }
  
  // Higher confidence for similar sized candles
  const sizeRatio = bodySize2 / bodySize1;
  if (sizeRatio > 0.8 && sizeRatio < 1.2) {
    confidence += 0.1;
  }

  confidence = Math.min(1, confidence);

  return {
    match: true,
    confidence,
    meta: {
      candle1BodySize: bodySize1,
      candle2BodySize: bodySize2,
      penetrationRatio,
      gapSize: candle2.open - candle1.high,
      candle1BodyMidpoint
    }
  };
}

const spec = {
  name: "dark-cloud-cover",
  type: "double-candle",
  minCandles: 2,
  shapeOnly: true,
  description: "Vela roja abre arriba de vela verde anterior y cierra en su mitad.",
  typicalPrediction: "reversión bajista",
  commonContext: "después de subidas, indica que los vendedores están tomando control"
};

module.exports = {
  detectDarkCloudCover,
  spec
};
