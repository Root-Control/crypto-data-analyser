/**
 * Three Inside Pattern Detection
 * Shape-only detection with volume analysis and temporal duplicate filtering
 */

const { 
  isBullish, 
  isBearish,
  calculateBodySize, 
  calculateBodyRatio,
  calculateATR,
  calculateMedianBody
} = require('../utils');

function detectThreeInside(candles, index) {
  // Three Inside es un patrón de 3 velas
  // Detect AFTER the third candle has occurred
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
  // REGLA 1: Primera vela fuerte (alcista o bajista)
  // ========================================
  const candle1Body = calculateBodySize(candle1);
  const candle1Range = candle1.high - candle1.low;
  const candle1BodyRatio = candle1Body / candle1Range;

  if (candle1BodyRatio < 0.6) {
    return { match: false, confidence: 0, meta: { reason: 'First candle not strong enough' } };
  }

  // ========================================
  // REGLA 2: Segunda vela dentro de la primera (inside bar)
  // ========================================
  // La segunda vela debe estar completamente dentro del rango de la primera vela
  if (candle2.high >= candle1.high || candle2.low <= candle1.low) {
    return { match: false, confidence: 0, meta: { reason: 'Second candle not inside first candle' } };
  }

  // ========================================
  // REGLA 3: Tercera vela que rompe en dirección opuesta
  // ========================================
  const isFirstCandleBullish = isBullish(candle1);
  const isThirdCandleBullish = isBullish(candle3);

  // La tercera vela debe ser opuesta a la primera
  if (isFirstCandleBullish === isThirdCandleBullish) {
    return { match: false, confidence: 0, meta: { reason: 'Third candle same direction as first' } };
  }

  // ========================================
  // REGLA 4: Análisis de volumen
  // ========================================
  // Los volúmenes de las velas 1 y 3 deben ser altos, el de la vela 2 puede ser menor
  const candle2Volume = candle2.volume;
  const avgOutsideVolume = (candle1.volume + candle3.volume) / 2;

  if (candle2Volume > avgOutsideVolume * 0.9) {
    return { match: false, confidence: 0, meta: { reason: 'Second candle volume too high' } };
  }

  // ========================================
  // REGLA 5: Tercera vela debe ser fuerte
  // ========================================
  const candle3Body = calculateBodySize(candle3);
  const candle3Range = candle3.high - candle3.low;
  const candle3BodyRatio = candle3Body / candle3Range;

  if (candle3BodyRatio < 0.6) {
    return { match: false, confidence: 0, meta: { reason: 'Third candle not strong enough' } };
  }

  // ========================================
  // CALCULAR CONFIANZA
  // ========================================
  let confidence = 0.7; // Base confidence

  // Bonificación por velas muy fuertes
  if (candle1BodyRatio > 0.8) confidence += 0.1;
  if (candle3BodyRatio > 0.8) confidence += 0.1;

  // Bonificación por segunda vela muy pequeña
  const candle2Body = calculateBodySize(candle2);
  const candle2Range = candle2.high - candle2.low;
  const candle2BodyRatio = candle2Body / candle2Range;
  
  if (candle2BodyRatio < 0.3) confidence += 0.1;

  // Bonificación por volumen bajo en la segunda vela
  const volumeReduction = (avgOutsideVolume - candle2Volume) / avgOutsideVolume;
  if (volumeReduction > 0.5) confidence += 0.1;

  confidence = Math.min(1, confidence);

  return {
    match: true,
    confidence,
    meta: {
      patternType: isFirstCandleBullish ? 'bearish-reversal' : 'bullish-reversal',
      candle1BodyRatio,
      candle2BodyRatio,
      candle3BodyRatio,
      volumeAnalysis: {
        candle1Volume: candle1.volume,
        candle2Volume: candle2.volume,
        candle3Volume: candle3.volume,
        avgOutsideVolume,
        volumeReduction: (volumeReduction * 100).toFixed(2) + '%'
      },
      insideBar: {
        candle1High: candle1.high,
        candle1Low: candle1.low,
        candle2High: candle2.high,
        candle2Low: candle2.low,
        candle3High: candle3.high,
        candle3Low: candle3.low
      }
    }
  };
}

/**
 * Filtra duplicados temporales en las detecciones de Three Inside
 * Mantiene la detección más antigua (menor timestamp) y elimina las otras
 * cuando están a 15 minutos de diferencia o menos
 */
function filterTemporalDuplicates(detections) {
  if (!detections || detections.length === 0) return detections;
  
  // Ordenar por timestamp (más antiguo primero)
  const sortedDetections = detections.sort((a, b) => a.candle.timestamp - b.candle.timestamp);
  
  const filteredDetections = [];
  const fifteenMinutes = 15 * 60 * 1000; // 15 minutos en milisegundos
  
  for (let i = 0; i < sortedDetections.length; i++) {
    const currentDetection = sortedDetections[i];
    const currentTime = currentDetection.candle.timestamp;
    
    // Verificar si hay una detección anterior muy cercana (dentro de 15 minutos)
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
    
    // Solo agregar si no es duplicado temporal
    if (!isDuplicate) {
      filteredDetections.push(currentDetection);
    }
  }
  
  console.log(`🔍 Three Inside: Filtrados ${detections.length - filteredDetections.length} duplicados temporales (${detections.length} → ${filteredDetections.length})`);
  
  return filteredDetections;
}

const spec = {
  name: "three-inside",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Tres velas donde la del medio está dentro de las otras dos, indicando reversión.",
  typicalPrediction: "reversión o consolidación",
  commonContext: "después de movimientos fuertes, indica que el momentum se está agotando y puede revertirse"
};

module.exports = {
  detectThreeInside,
  filterTemporalDuplicates,
  spec
};
