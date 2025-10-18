/**
 * Tasuki (Mat Hold) Pattern Detection
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

function detectTasukiMatHold(candles, index) {
  // Tasuki Mat Hold es un patrón de 4 velas
  // Detect AFTER the fourth candle has occurred
  if (index < 3 || index >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const candle1 = candles[index - 3];  // First candle (3 periods ago)
  const candle2 = candles[index - 2];  // Second candle (2 periods ago)
  const candle3 = candles[index - 1];  // Third candle (1 period ago)
  const candle4 = candles[index];      // Fourth candle (current/just completed)

  // Get context for ATR and median calculations
  const contextCandles = candles.slice(Math.max(0, index - 20), index + 1);
  const atr14 = calculateATR(contextCandles, 14);
  const medianBody = calculateMedianBody(contextCandles, 20);

  // ========================================
  // REGLA 1: Primera vela alcista fuerte
  // ========================================
  if (!isBullish(candle1)) {
    return { match: false, confidence: 0, meta: { reason: 'First candle not bullish' } };
  }

  const candle1Body = calculateBodySize(candle1);
  const candle1Range = candle1.high - candle1.low;
  const candle1BodyRatio = candle1Body / candle1Range;

  if (candle1BodyRatio < 0.6) {
    return { match: false, confidence: 0, meta: { reason: 'First candle not strong enough' } };
  }

  // ========================================
  // REGLA 2: Segunda vela alcista con gap up
  // ========================================
  if (!isBullish(candle2)) {
    return { match: false, confidence: 0, meta: { reason: 'Second candle not bullish' } };
  }

  // Debe haber gap up entre primera y segunda vela
  if (candle2.low <= candle1.high) {
    return { match: false, confidence: 0, meta: { reason: 'No gap up between first and second candle' } };
  }

  // ========================================
  // REGLA 3: Tercera vela bajista que llena el gap
  // ========================================
  if (!isBearish(candle3)) {
    return { match: false, confidence: 0, meta: { reason: 'Third candle not bearish' } };
  }

  // La tercera vela debe llenar el gap (cerrar dentro del rango de la primera vela)
  if (candle3.close > candle1.high) {
    return { match: false, confidence: 0, meta: { reason: 'Third candle does not fill the gap' } };
  }

  // ========================================
  // REGLA 4: Cuarta vela alcista fuerte que confirma
  // ========================================
  if (!isBullish(candle4)) {
    return { match: false, confidence: 0, meta: { reason: 'Fourth candle not bullish' } };
  }

  const candle4Body = calculateBodySize(candle4);
  const candle4Range = candle4.high - candle4.low;
  const candle4BodyRatio = candle4Body / candle4Range;

  if (candle4BodyRatio < 0.6) {
    return { match: false, confidence: 0, meta: { reason: 'Fourth candle not strong enough' } };
  }

  // ========================================
  // REGLA 5: Análisis de volumen
  // ========================================
  // Los volúmenes de las velas 1, 2 y 4 deben ser altos, el de la vela 3 puede ser menor
  const highVolumeCandles = [candle1.volume, candle2.volume, candle4.volume];
  const avgHighVolume = highVolumeCandles.reduce((sum, vol) => sum + vol, 0) / highVolumeCandles.length;

  if (candle3.volume > avgHighVolume * 0.8) {
    return { match: false, confidence: 0, meta: { reason: 'Third candle volume too high' } };
  }

  // ========================================
  // CALCULAR CONFIANZA
  // ========================================
  let confidence = 0.7; // Base confidence

  // Bonificación por velas muy fuertes
  if (candle1BodyRatio > 0.8) confidence += 0.1;
  if (candle4BodyRatio > 0.8) confidence += 0.1;

  // Bonificación por gap grande
  const gapSize = candle2.low - candle1.high;
  const gapRatio = gapSize / candle1Range;
  if (gapRatio > 0.1) confidence += 0.1;

  // Bonificación por volumen bajo en la tercera vela
  const volumeReduction = (avgHighVolume - candle3.volume) / avgHighVolume;
  if (volumeReduction > 0.3) confidence += 0.1;

  confidence = Math.min(1, confidence);

  return {
    match: true,
    confidence,
    meta: {
      candle1BodyRatio,
      candle4BodyRatio,
      gapSize,
      gapRatio,
      volumeAnalysis: {
        candle1Volume: candle1.volume,
        candle2Volume: candle2.volume,
        candle3Volume: candle3.volume,
        candle4Volume: candle4.volume,
        avgHighVolume,
        volumeReduction: (volumeReduction * 100).toFixed(2) + '%'
      },
      pattern: {
        candle1High: candle1.high,
        candle2Low: candle2.low,
        candle3Close: candle3.close,
        candle4High: candle4.high
      }
    }
  };
}

/**
 * Filtra duplicados temporales en las detecciones de Tasuki Mat Hold
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
  
  console.log(`🔍 Tasuki Mat Hold: Filtrados ${detections.length - filteredDetections.length} duplicados temporales (${detections.length} → ${filteredDetections.length})`);
  
  return filteredDetections;
}

const spec = {
  name: "tasuki-mat-hold",
  type: "triple-candle",
  minCandles: 4,
  shapeOnly: true,
  description: "Patrón de cuatro velas que muestra consolidación en tendencia alcista con gap y confirmación.",
  typicalPrediction: "continuación alcista",
  commonContext: "en tendencias alcistas, indica pausa con gap antes de continuar subiendo con fuerza renovada"
};

module.exports = {
  detectTasukiMatHold,
  filterTemporalDuplicates,
  spec
};
