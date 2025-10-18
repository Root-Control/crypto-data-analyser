/**
 * Three Black Crows Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { 
  isBearish, 
  calculateBodySize, 
  calculateBodyRatio,
  calculateUpperWick,
  calculateLowerWick,
  calculateATR,
  calculateMedianBody
} = require('../utils');

function detectThreeBlackCrows(candles, index) {
  // Detect AFTER the third candle has occurred (3 crows pattern)
  if (index < 2 || index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index - 2];  // First candle (2 periods ago)
  const candle2 = candles[index - 1];  // Second candle (1 period ago)
  const candle3 = candles[index];      // Third candle (current/just completed)

  // Get context for ATR and median calculations
  const contextCandles = candles.slice(Math.max(0, index - 20), index + 1);
  const atr14 = calculateATR(contextCandles, 14);
  const medianBody = calculateMedianBody(contextCandles, 20);

  // ========================================
  // REGLA 1: Bajista real - close < open en las tres
  // ========================================
  if (!isBearish(candle1) || !isBearish(candle2) || !isBearish(candle3)) {
    return { match: false, confidence: 0, meta: { reason: 'Not all bearish' } };
  }

  // ========================================
  // REGLA 2: Cuerpo largo (no mini-velas) - SIMPLIFICADO
  // ========================================
  const bodySize1 = calculateBodySize(candle1);
  const bodySize2 = calculateBodySize(candle2);
  const bodySize3 = calculateBodySize(candle3);
  
  const bodyRatio1 = calculateBodyRatio(candle1);
  const bodyRatio2 = calculateBodyRatio(candle2);
  const bodyRatio3 = calculateBodyRatio(candle3);

  // Solo verificar que no sean dojis (body ratio > 20%)
  const minBodyRatio = 0.2; // 20% del rango (muy relajado)
  if (bodyRatio1 < minBodyRatio || bodyRatio2 < minBodyRatio || bodyRatio3 < minBodyRatio) {
    return { match: false, confidence: 0, meta: { reason: 'Body too small (doji-like)' } };
  }

  // ========================================
  // REGLA 3: Progresión clara (SIMPLIFICADO)
  // ========================================
  // close(C1) > close(C2) > close(C3)
  if (candle1.close <= candle2.close || candle2.close <= candle3.close) {
    return { match: false, confidence: 0, meta: { reason: 'No clear progression' } };
  }

  // ========================================
  // REGLA 4: Volúmenes crecientes (momentum real)
  // ========================================
  // Los volúmenes de las 3 crows deben ser >2X las 3 velas anteriores a la primera crow
  if (index < 5) {
    return { match: false, confidence: 0, meta: { reason: 'Not enough history for volume comparison' } };
  }

  // Las 3 velas ANTES de la primera crow (candle1)
  const prevCandle1 = candles[index - 5]; // 5 periods ago (antes de candle1)
  const prevCandle2 = candles[index - 4]; // 4 periods ago (antes de candle1)
  const prevCandle3 = candles[index - 3]; // 3 periods ago (antes de candle1)

  // Calcular volumen promedio de las 3 velas anteriores a la primera crow
  const prevAvgVolume = (prevCandle1.volume + prevCandle2.volume + prevCandle3.volume) / 3;
  // Calcular volumen promedio de las 3 crows
  const crowsAvgVolume = (candle1.volume + candle2.volume + candle3.volume) / 3;

  // Los volúmenes de las 3 crows deben ser al menos 2X los anteriores
  const volumeMultiplier = 2.0;
  if (crowsAvgVolume < prevAvgVolume * volumeMultiplier) {
    return { match: false, confidence: 0, meta: { reason: 'Crows volume not 2x previous' } };
  }

  // Ideal: low(C1) > low(C2) > low(C3) (mínimos descendentes) - BONUS
  const lowsDescending = candle1.low > candle2.low && candle2.low > candle3.low;

  // ========================================
  // CALCULAR CONFIANZA
  // ========================================
  let confidence = 0.7; // Base confidence

  // Bonificación por cuerpos muy largos
  const avgBodyRatio = (bodyRatio1 + bodyRatio2 + bodyRatio3) / 3;
  if (avgBodyRatio > 0.8) confidence += 0.1;
  if (avgBodyRatio > 0.9) confidence += 0.1;

  // Bonificación por progresión perfecta
  if (lowsDescending) confidence += 0.1;

  confidence = Math.min(1, confidence);

  return {
    match: true,
    confidence,
    meta: {
      bodySize1, bodySize2, bodySize3,
      bodyRatio1, bodyRatio2, bodyRatio3,
      avgBodyRatio,
      lowsDescending,
      volumeAnalysis: {
        prevAvgVolume,
        crowsAvgVolume,
        volumeMultiplier: (crowsAvgVolume / prevAvgVolume).toFixed(2) + 'x',
        volumeIncrease: ((crowsAvgVolume - prevAvgVolume) / prevAvgVolume * 100).toFixed(2) + '%',
        candle1Volume: candle1.volume,
        candle2Volume: candle2.volume,
        candle3Volume: candle3.volume
      },
      progression: {
        close1: candle1.close,
        close2: candle2.close,
        close3: candle3.close,
        low1: candle1.low,
        low2: candle2.low,
        low3: candle3.low
      }
    }
  };
}

const spec = {
  name: "three-black-crows",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Tres velas rojas consecutivas con progresión clara y volúmenes crecientes que confirman momentum bajista real.",
  typicalPrediction: "continuación bajista fuerte",
  commonContext: "en tendencias bajistas, muestra fuerza sostenida de vendedores con momentum real y volúmenes crecientes"
};

module.exports = {
  detectThreeBlackCrows,
  spec
};
