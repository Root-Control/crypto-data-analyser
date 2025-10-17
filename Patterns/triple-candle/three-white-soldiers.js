/**
 * Three White Soldiers Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { isBullish, calculateBodySize } = require('../utils');

function detectThreeWhiteSoldiers(candles, index) {
  if (index + 2 >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index];
  const candle2 = candles[index + 1];
  const candle3 = candles[index + 2];

  // Three White Soldiers criteria:
  // 1. All three candles: bullish
  // 2. Each candle opens within the previous candle's body
  // 3. Each candle closes higher than the previous candle
  // 4. Each candle has a significant body
  
  if (!isBullish(candle1) || !isBullish(candle2) || !isBullish(candle3)) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Second candle should open within first candle's body
  const candle1BodyTop = Math.max(candle1.open, candle1.close);
  const candle1BodyBottom = Math.min(candle1.open, candle1.close);
  if (candle2.open < candle1BodyBottom || candle2.open > candle1BodyTop) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Third candle should open within second candle's body
  const candle2BodyTop = Math.max(candle2.open, candle2.close);
  const candle2BodyBottom = Math.min(candle2.open, candle2.close);
  if (candle3.open < candle2BodyBottom || candle3.open > candle2BodyTop) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Each candle should close higher than the previous
  if (candle2.close <= candle1.close || candle3.close <= candle2.close) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Each candle should have significant body (not too small)
  const bodySize1 = calculateBodySize(candle1);
  const bodySize2 = calculateBodySize(candle2);
  const bodySize3 = calculateBodySize(candle3);
  const totalRange1 = candle1.high - candle1.low;
  const totalRange2 = candle2.high - candle2.low;
  const totalRange3 = candle3.high - candle3.low;

  const bodyRatio1 = bodySize1 / totalRange1;
  const bodyRatio2 = bodySize2 / totalRange2;
  const bodyRatio3 = bodySize3 / totalRange3;

  if (bodyRatio1 < 0.6 || bodyRatio2 < 0.6 || bodyRatio3 < 0.6) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence
  let confidence = 0.8;
  
  // Higher confidence for larger bodies
  const avgBodyRatio = (bodyRatio1 + bodyRatio2 + bodyRatio3) / 3;
  if (avgBodyRatio > 0.8) {
    confidence += 0.1;
  }
  
  // Higher confidence for consistent progression
  const progression1 = (candle2.close - candle1.close) / candle1.close;
  const progression2 = (candle3.close - candle2.close) / candle2.close;
  const progressionConsistency = 1 - Math.abs(progression1 - progression2) / Math.max(progression1, progression2);
  
  if (progressionConsistency > 0.8) {
    confidence += 0.1;
  }

  confidence = Math.min(1, confidence);

  return {
    match: true,
    confidence,
    meta: {
      candle1BodySize: bodySize1,
      candle2BodySize: bodySize2,
      candle3BodySize: bodySize3,
      avgBodyRatio,
      progression1,
      progression2,
      progressionConsistency
    }
  };
}

const spec = {
  name: "three-white-soldiers",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Three consecutive bullish candles with progressively higher closes. Strong bullish continuation pattern.",
  typicalPrediction: "bullish continuation",
  commonContext: "during uptrends, showing strong and consistent buying pressure"
};

module.exports = {
  detectThreeWhiteSoldiers,
  spec
};
