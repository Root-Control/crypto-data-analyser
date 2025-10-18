/**
 * Rising/Falling Three Methods Pattern Detection
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

function detectRisingFallingThreeMethods(candles, index) {
  // Rising/Falling Three Methods es un patrón de 5 velas
  // Detect AFTER the fifth candle has occurred
  if (index < 4 || index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index - 4];  // First candle (4 periods ago)
  const candle2 = candles[index - 3];  // Second candle (3 periods ago)
  const candle3 = candles[index - 2];  // Third candle (2 periods ago)
  const candle4 = candles[index - 1];  // Fourth candle (1 period ago)
  const candle5 = candles[index];      // Fifth candle (current/just completed)

  // Get context for ATR and median calculations
  const contextCandles = candles.slice(Math.max(0, index - 20), index + 1);
  const atr14 = calculateATR(contextCandles, 14);
  const medianBody = calculateMedianBody(contextCandles, 20);

  // ========================================
  // REGLA 1: Primera vela fuerte (alcista o bajista)
  // ========================================
  const firstCandleBody = calculateBodySize(candle1);
  const firstCandleRange = candle1.high - candle1.low;
  const firstCandleBodyRatio = firstCandleBody / firstCandleRange;

  if (firstCandleBodyRatio < 0.6) {
    return { match: false, confidence: 0, meta: { reason: 'First candle not strong enough' } };
  }

  // ========================================
  // REGLA 2: Tres velas de consolidación (pequeñas, dentro del rango)
  // ========================================
  const consolidationCandles = [candle2, candle3, candle4];
  const firstCandleHigh = candle1.high;
  const firstCandleLow = candle1.low;
  const firstCandleRangeSize = firstCandleHigh - firstCandleLow;

  // Verificar que las 3 velas de consolidación estén dentro del rango de la primera vela
  for (let i = 0; i < consolidationCandles.length; i++) {
    const candle = consolidationCandles[i];
    if (candle.high > firstCandleHigh || candle.low < firstCandleLow) {
      return { match: false, confidence: 0, meta: { reason: 'Consolidation candles outside range' } };
    }
  }

  // Verificar que las velas de consolidación sean pequeñas
  for (let i = 0; i < consolidationCandles.length; i++) {
    const candle = consolidationCandles[i];
    const bodySize = calculateBodySize(candle);
    const bodyRatio = bodySize / (candle.high - candle.low);
    
    if (bodyRatio > 0.7) { // No deben ser velas muy grandes
      return { match: false, confidence: 0, meta: { reason: 'Consolidation candles too large' } };
    }
  }

  // ========================================
  // REGLA 3: Quinta vela confirma la tendencia
  // ========================================
  const isRisingThreeMethods = isBullish(candle1) && isBullish(candle5);
  const isFallingThreeMethods = isBearish(candle1) && isBearish(candle5);

  if (!isRisingThreeMethods && !isFallingThreeMethods) {
    return { match: false, confidence: 0, meta: { reason: 'Fifth candle does not confirm trend' } };
  }

  // ========================================
  // REGLA 4: Volúmenes crecientes en la confirmación
  // ========================================
  // Los volúmenes de las 3 velas de consolidación deben ser menores que la primera y quinta vela
  const firstCandleVolume = candle1.volume;
  const fifthCandleVolume = candle5.volume;
  const consolidationAvgVolume = (candle2.volume + candle3.volume + candle4.volume) / 3;

  if (consolidationAvgVolume >= firstCandleVolume * 0.8 || consolidationAvgVolume >= fifthCandleVolume * 0.8) {
    return { match: false, confidence: 0, meta: { reason: 'Consolidation volume too high' } };
  }

  // ========================================
  // CALCULAR CONFIANZA
  // ========================================
  let confidence = 0.7; // Base confidence

  // Bonificación por primera vela muy fuerte
  if (firstCandleBodyRatio > 0.8) confidence += 0.1;
  if (firstCandleBodyRatio > 0.9) confidence += 0.1;

  // Bonificación por quinta vela fuerte
  const fifthCandleBody = calculateBodySize(candle5);
  const fifthCandleRange = candle5.high - candle5.low;
  const fifthCandleBodyRatio = fifthCandleBody / fifthCandleRange;
  
  if (fifthCandleBodyRatio > 0.7) confidence += 0.1;

  // Bonificación por volumen bajo en consolidación
  const volumeReduction = (firstCandleVolume - consolidationAvgVolume) / firstCandleVolume;
  if (volumeReduction > 0.5) confidence += 0.1;

  confidence = Math.min(1, confidence);

  return {
    match: true,
    confidence,
    meta: {
      patternType: isRisingThreeMethods ? 'rising' : 'falling',
      firstCandleBodyRatio,
      fifthCandleBodyRatio,
      consolidationAvgVolume,
      volumeAnalysis: {
        firstCandleVolume,
        fifthCandleVolume,
        consolidationAvgVolume,
        volumeReduction: (volumeReduction * 100).toFixed(2) + '%'
      },
      consolidation: {
        candle2High: candle2.high,
        candle2Low: candle2.low,
        candle3High: candle3.high,
        candle3Low: candle3.low,
        candle4High: candle4.high,
        candle4Low: candle4.low
      }
    }
  };
}

/**
 * Filtra duplicados temporales en las detecciones de Rising/Falling Three Methods
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
  
  console.log(`🔍 Rising/Falling Three Methods: Filtrados ${detections.length - filteredDetections.length} duplicados temporales (${detections.length} → ${filteredDetections.length})`);
  
  return filteredDetections;
}

const spec = {
  name: "rising-falling-three-methods",
  type: "triple-candle",
  minCandles: 5,
  shapeOnly: true,
  description: "Patrón de cinco velas que muestra pausa en la tendencia con consolidación y confirmación.",
  typicalPrediction: "continuación después de pausa",
  commonContext: "en tendencias fuertes, indica pausa temporal antes de continuar con momentum renovado"
};

module.exports = {
  detectRisingFallingThreeMethods,
  filterTemporalDuplicates,
  spec
};
