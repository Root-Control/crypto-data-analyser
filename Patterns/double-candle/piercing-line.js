/**
 * Piercing Line Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { isBearish, isBullish, calculateBodySize } = require('../utils');

function detectPiercingLine(candles, index) {
  if (index + 1 >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index];     // Bearish candle
  const candle2 = candles[index + 1]; // Bullish candle

  // Piercing Line criteria:
  // 1. First candle: bearish
  // 2. Second candle: bullish
  // 3. Second candle opens below first candle's low
  // 4. Second candle closes above midpoint of first candle's body
  
  if (!isBearish(candle1)) {
    return { match: false, confidence: 0, meta: {} };
  }

  if (!isBullish(candle2)) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Second candle should open below first candle's low
  if (candle2.open >= candle1.low) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate first candle's body midpoint
  const candle1BodyTop = Math.max(candle1.open, candle1.close);
  const candle1BodyBottom = Math.min(candle1.open, candle1.close);
  const candle1BodyMidpoint = (candle1BodyTop + candle1BodyBottom) / 2;

  // Second candle should close above first candle's body midpoint
  if (candle2.close <= candle1BodyMidpoint) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence
  const bodySize1 = calculateBodySize(candle1);
  const bodySize2 = calculateBodySize(candle2);
  const penetrationRatio = (candle2.close - candle1BodyMidpoint) / (candle1BodyTop - candle1BodyBottom);
  
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
      gapSize: candle1.low - candle2.open,
      candle1BodyMidpoint
    }
  };
}

const spec = {
  name: "piercing-line",
  type: "double-candle",
  minCandles: 2,
  shapeOnly: true,
  description: "Bullish candle that opens below previous bearish candle's low and closes above its midpoint. Bullish reversal pattern.",
  typicalPrediction: "bullish reversal",
  commonContext: "after downtrends or at support levels, showing strong buying interest"
};

module.exports = {
  detectPiercingLine,
  spec
};
