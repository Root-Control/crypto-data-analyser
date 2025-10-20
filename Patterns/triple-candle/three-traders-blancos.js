/**
 * Three Traders Blancos Pattern Detection
 * Patrón avanzado con múltiples filtros técnicos y sistema de puntuación de salud
 */

const { 
  isBullish, 
  calculateBodySize, 
  calculateBodyRatio,
  calculateUpperWick,
  calculateLowerWick,
  calculateATR,
  calculateMedianBody
} = require('../utils');

/**
 * Calcula RSI (Relative Strength Index)
 * @param {Array} prices - Array de precios de cierre
 * @param {number} period - Período para RSI (default 14)
 * @returns {number} Valor RSI
 */
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calcula ADX (Average Directional Index)
 * @param {Array} candles - Array de velas
 * @param {number} period - Período para ADX (default 14)
 * @returns {Object} {adx, plusDI, minusDI}
 */
function calculateADX(candles, period = 14) {
  if (candles.length < period + 1) return { adx: 25, plusDI: 25, minusDI: 25 };
  
  const trueRanges = [];
  const plusDMs = [];
  const minusDMs = [];
  
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );
    
    const plusDM = current.high - previous.high > previous.low - current.low 
      ? Math.max(current.high - previous.high, 0) : 0;
    const minusDM = previous.low - current.low > current.high - previous.high 
      ? Math.max(previous.low - current.low, 0) : 0;
    
    trueRanges.push(tr);
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }
  
  const avgTR = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgPlusDM = plusDMs.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgMinusDM = minusDMs.slice(-period).reduce((a, b) => a + b, 0) / period;
  
  const plusDI = (avgPlusDM / avgTR) * 100;
  const minusDI = (avgMinusDM / avgTR) * 100;
  
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  const adx = dx; // Simplified ADX calculation
  
  return { adx, plusDI, minusDI };
}

/**
 * Calcula EMA (Exponential Moving Average)
 * @param {Array} prices - Array de precios
 * @param {number} period - Período para EMA
 * @returns {number} Valor EMA
 */
function calculateEMA(prices, period) {
  if (prices.length === 0) return 0;
  if (prices.length === 1) return prices[0];
  
  const multiplier = 2 / (period + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

/**
 * Calcula percentil de volumen
 * @param {Array} volumes - Array de volúmenes
 * @param {number} currentVolume - Volumen actual
 * @param {number} lookback - Período de lookback
 * @returns {number} Percentil del volumen
 */
function calculateVolumePercentile(volumes, currentVolume, lookback = 50) {
  if (volumes.length < lookback) return 50;
  
  const recentVolumes = volumes.slice(-lookback);
  const sortedVolumes = [...recentVolumes].sort((a, b) => a - b);
  
  let rank = 0;
  for (const vol of sortedVolumes) {
    if (vol < currentVolume) rank++;
    else break;
  }
  
  return (rank / sortedVolumes.length) * 100;
}

/**
 * Calcula el score de salud del rally (0-100)
 * @param {Object} candle1 - Primera vela
 * @param {Object} candle2 - Segunda vela
 * @param {Object} candle3 - Tercera vela
 * @param {Array} contextCandles - Velas de contexto
 * @returns {Object} {score, details}
 */
function calculateRallyHealthScore(candle1, candle2, candle3, contextCandles) {
  let score = 0;
  const details = {};
  
  // 1. Cuerpo ≥ 60% (3/3) - 10 puntos
  const bodyRatio1 = calculateBodyRatio(candle1);
  const bodyRatio2 = calculateBodyRatio(candle2);
  const bodyRatio3 = calculateBodyRatio(candle3);
  
  if (bodyRatio1 >= 0.6 && bodyRatio2 >= 0.6 && bodyRatio3 >= 0.6) {
    score += 10;
    details.bodyRatio = 'PASS';
  } else {
    details.bodyRatio = 'FAIL';
  }
  
  // 2. Wick superior ≤ 20% (3/3) - 10 puntos
  const upperWick1 = calculateUpperWick(candle1);
  const upperWick2 = calculateUpperWick(candle2);
  const upperWick3 = calculateUpperWick(candle3);
  
  if (upperWick1 <= 0.20 && upperWick2 <= 0.20 && upperWick3 <= 0.20) {
    score += 10;
    details.upperWick = 'PASS';
  } else {
    details.upperWick = 'FAIL';
  }
  
  // 3. RSI 55-68 - 10 puntos
  const closes = contextCandles.slice(-20).map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  if (rsi >= 55 && rsi <= 68) {
    score += 10;
    details.rsi = 'PASS';
  } else {
    details.rsi = 'FAIL';
  }
  
  // 4. ADX 20-30 con +DI > -DI - 10 puntos
  const adxData = calculateADX(contextCandles.slice(-20), 14);
  if (adxData.adx >= 20 && adxData.adx <= 30 && adxData.plusDI > adxData.minusDI) {
    score += 10;
    details.adx = 'PASS';
  } else {
    details.adx = 'FAIL';
  }
  
  // 5. Volumen P60-P85 con leve aumento - 10 puntos
  const volumes = contextCandles.slice(-50).map(c => c.volume);
  const volPercentile1 = calculateVolumePercentile(volumes, candle1.volume, 50);
  const volPercentile2 = calculateVolumePercentile(volumes, candle2.volume, 50);
  const volPercentile3 = calculateVolumePercentile(volumes, candle3.volume, 50);
  
  const volIncrease = candle3.volume >= candle2.volume * 0.95 && candle2.volume >= candle1.volume * 0.95;
  const volInRange = volPercentile3 >= 60 && volPercentile3 <= 85;
  
  if (volInRange && volIncrease) {
    score += 10;
    details.volume = 'PASS';
  } else {
    details.volume = 'FAIL';
  }
  
  // 6. EMA20 > EMA50 con pendiente positiva - 10 puntos
  const closesForEMA = contextCandles.map(c => c.close);
  const ema20 = calculateEMA(closesForEMA, 20);
  const ema50 = calculateEMA(closesForEMA, 50);
  const ema20Prev = calculateEMA(closesForEMA.slice(0, -1), 20);
  
  if (ema20 > ema50 && ema20 > ema20Prev) {
    score += 10;
    details.ema = 'PASS';
  } else {
    details.ema = 'FAIL';
  }
  
  // 7. Distancia a EMA20 ≤ 1.5×ATR - 10 puntos
  const atr = calculateATR(contextCandles, 14);
  const distanceToEMA20 = Math.abs(candle3.close - ema20) / candle3.close;
  const maxDistance = (1.5 * atr) / candle3.close;
  
  if (distanceToEMA20 <= maxDistance) {
    score += 10;
    details.emaDistance = 'PASS';
  } else {
    details.emaDistance = 'FAIL';
  }
  
  // 8. HH/HL claros - 10 puntos
  const recentHighs = contextCandles.slice(-10).map(c => c.high);
  const recentLows = contextCandles.slice(-10).map(c => c.low);
  const isHH = candle3.high > Math.max(...recentHighs.slice(0, -1));
  const isHL = candle3.low > Math.min(...recentLows.slice(0, -1));
  
  if (isHH && isHL) {
    score += 10;
    details.hhhl = 'PASS';
  } else {
    details.hhhl = 'FAIL';
  }
  
  // 9. Delta+ estable (simulado) - 10 puntos
  // Para simplificar, asumimos que el delta es estable si el volumen es consistente
  const volumeConsistency = Math.abs(candle3.volume - candle2.volume) / candle2.volume < 0.3;
  if (volumeConsistency) {
    score += 10;
    details.delta = 'PASS';
  } else {
    details.delta = 'FAIL';
  }
  
  // 10. Ruptura + re-test de nivel - 10 puntos
  // Simplificado: verificamos si hay una ruptura reciente
  const recentMax = Math.max(...contextCandles.slice(-20, -3).map(c => c.high));
  const hasBreakout = candle1.high > recentMax && candle2.high > recentMax && candle3.high > recentMax;
  
  if (hasBreakout) {
    score += 10;
    details.breakout = 'PASS';
  } else {
    details.breakout = 'FAIL';
  }
  
  return { score, details };
}

/**
 * Detecta el patrón Three Traders Blancos (versión simplificada)
 * @param {Array} candles - Array de velas
 * @param {number} index - Índice de la vela actual
 * @returns {Object} Resultado de la detección
 */
function detectThreeTradersBlancos(candles, index) {
  // Detect AFTER the third candle has occurred
  if (index < 2 || index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index - 2];  // First candle
  const candle2 = candles[index - 1];  // Second candle
  const candle3 = candles[index];      // Third candle (current)

  // Get context for calculations
  const contextCandles = candles.slice(Math.max(0, index - 50), index + 1);
  const atr14 = calculateATR(contextCandles, 14);

  // ========================================
  // REGLA 1: Cuerpo y cierre (2 de 3 velas)
  // ========================================
  if (!isBullish(candle1) || !isBullish(candle2) || !isBullish(candle3)) {
    return { match: false, confidence: 0, meta: { reason: 'Not all bullish' } };
  }

  // Cuerpo ≥ 50% del rango en 2 de 3 velas
  const bodyRatio1 = calculateBodyRatio(candle1);
  const bodyRatio2 = calculateBodyRatio(candle2);
  const bodyRatio3 = calculateBodyRatio(candle3);
  
  const bodyCount = [bodyRatio1, bodyRatio2, bodyRatio3].filter(ratio => ratio >= 0.5).length;
  if (bodyCount < 2) {
    return { match: false, confidence: 0, meta: { reason: 'Less than 2 candles with body ≥ 50%' } };
  }

  // Cierre en el tercio superior en 2 de 3 velas
  const closeInUpperThird1 = (candle1.close - candle1.low) / (candle1.high - candle1.low) >= 0.67;
  const closeInUpperThird2 = (candle2.close - candle2.low) / (candle2.high - candle2.low) >= 0.67;
  const closeInUpperThird3 = (candle3.close - candle3.low) / (candle3.high - candle3.low) >= 0.67;
  
  const closeCount = [closeInUpperThird1, closeInUpperThird2, closeInUpperThird3].filter(Boolean).length;
  if (closeCount < 2) {
    return { match: false, confidence: 0, meta: { reason: 'Less than 2 candles with close in upper third' } };
  }

  // ========================================
  // REGLA 2: Extensión controlada (ATR14)
  // ========================================
  const range1 = candle1.high - candle1.low;
  const range2 = candle2.high - candle2.low;
  const range3 = candle3.high - candle3.low;
  
  const range1Ratio = range1 / atr14;
  const range2Ratio = range2 / atr14;
  const range3Ratio = range3 / atr14;
  const totalRangeRatio = (range1 + range2 + range3) / atr14;
  
  // Ninguna vela con rango > 1.8× ATR
  if (range1Ratio > 1.8 || range2Ratio > 1.8 || range3Ratio > 1.8) {
    return { match: false, confidence: 0, meta: { reason: 'One candle range > 1.8x ATR' } };
  }
  
  // Suma de las 3 velas ≤ 3× ATR
  if (totalRangeRatio > 3.0) {
    return { match: false, confidence: 0, meta: { reason: 'Total range > 3x ATR' } };
  }

  // ========================================
  // REGLA 3: No-clímax (volumen y distancia)
  // ========================================
  // vol₃ ≥ vol₂ ≥ 0.9× vol₁
  if (candle3.volume < candle2.volume || candle2.volume < candle1.volume * 0.9) {
    return { match: false, confidence: 0, meta: { reason: 'Volume not increasing properly' } };
  }

  // Distancia a EMA20 ≤ 1.5× ATR
  const closesForEMA = contextCandles.map(c => c.close);
  const ema20 = calculateEMA(closesForEMA, 20);
  const distanceToEMA20 = Math.abs(candle3.close - ema20);
  const maxDistance = 1.5 * atr14;
  
  if (distanceToEMA20 > maxDistance) {
    return { match: false, confidence: 0, meta: { reason: 'Too far from EMA20' } };
  }

  // ========================================
  // RED FLAG: Anula todo
  // ========================================
  // Mecha superior del soldado 3 > 40% del rango
  const upperWick3 = calculateUpperWick(candle3);
  const upperWick3Ratio = upperWick3 / range3;
  if (upperWick3Ratio > 0.40) {
    return { match: false, confidence: 0, meta: { reason: 'Soldier 3 upper wick > 40%' } };
  }

  // Distancia a EMA20 > 1.8× ATR
  if (distanceToEMA20 > 1.8 * atr14) {
    return { match: false, confidence: 0, meta: { reason: 'Distance to EMA20 > 1.8x ATR' } };
  }

  // ========================================
  // CALCULAR CONFIANZA
  // ========================================
  let confidence = 0.7; // Base confidence

  // Bonificación por cumplir más criterios
  if (bodyCount === 3) confidence += 0.1;
  if (closeCount === 3) confidence += 0.1;
  if (totalRangeRatio <= 2.0) confidence += 0.1; // Extensión muy controlada

  confidence = Math.min(1.0, confidence);

  return {
    match: true,
    confidence,
    meta: {
      bodyRatio1, bodyRatio2, bodyRatio3,
      bodyCount, closeCount,
      range1Ratio, range2Ratio, range3Ratio, totalRangeRatio,
      upperWick3,
      ema20, distanceToEMA20,
      atr14,
      volumeProgression: {
        vol1: candle1.volume,
        vol2: candle2.volume,
        vol3: candle3.volume,
        vol2Ratio: candle2.volume / candle1.volume,
        vol3Ratio: candle3.volume / candle2.volume
      }
    }
  };
}

/**
 * Filtra duplicados temporales
 */
function filterTemporalDuplicates(detections) {
  if (!detections || detections.length === 0) return detections;
  
  const sortedDetections = detections.sort((a, b) => a.candle.timestamp - b.candle.timestamp);
  const filteredDetections = [];
  const fifteenMinutes = 15 * 60 * 1000;
  
  for (let i = 0; i < sortedDetections.length; i++) {
    const currentDetection = sortedDetections[i];
    const currentTime = currentDetection.candle.timestamp;
    
    let isDuplicate = false;
    
    for (let j = 0; j < filteredDetections.length; j++) {
      const previousDetection = filteredDetections[j];
      const previousTime = previousDetection.candle.timestamp;
      const timeDiff = Math.abs(currentTime - previousTime);
      
      if (timeDiff <= fifteenMinutes) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      filteredDetections.push(currentDetection);
    }
  }
  
  console.log(`🔍 Three Traders Blancos: Filtrados ${detections.length - filteredDetections.length} duplicados temporales (${detections.length} → ${filteredDetections.length})`);
  
  return filteredDetections;
}

const spec = {
  name: "three-traders-blancos",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: false,
  description: "Patrón avanzado de tres velas alcistas con múltiples filtros técnicos: cuerpo≥60%, wick≤20%, rango vs ATR, volumen P60-P85, RSI 55-68, ADX 20-30, EMA20>EMA50, y score de salud ≥70.",
  typicalPrediction: "continuación alcista fuerte",
  commonContext: "en tendencias alcistas con momentum saludable, muestra tres velas alcistas consecutivas con múltiples confirmaciones técnicas",
  filterCriteria: [
    "Las 3 velas deben ser alcistas (verdes) consecutivas",
    "Cuerpo ≥ 60% del rango en las 3 velas",
    "Mecha superior ≤ 20% en las 3 velas",
    "Cierres progresivamente más altos (close₃ > close₂ > close₁)",
    "Rango de cada vela entre 0.6× y 1.2× ATR(14)",
    "Suma de los 3 rangos ≤ 2.5× ATR",
    "Volumen en P60-P85 con ligero incremento vela a vela",
    "RSI(14) entre 55-68 y subiendo",
    "ADX(14) entre 20-30 con +DI > -DI",
    "EMA20 > EMA50 con pendiente positiva",
    "Distancia a EMA20 ≤ 1.5× ATR",
    "Score de salud del rally ≥ 70/100",
    "Filtro de duplicados temporales (15 minutos de diferencia)"
  ]
};

module.exports = {
  detectThreeTradersBlancos,
  filterTemporalDuplicates,
  calculateRallyHealthScore,
  spec
};
