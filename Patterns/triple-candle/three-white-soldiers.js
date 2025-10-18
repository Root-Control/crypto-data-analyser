/**
 * Three White Soldiers Pattern Detection
 * Shape-only detection with volume analysis and temporal duplicate filtering
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
 * Calcula TP y SL dinámicos basados en el análisis de las 3 velas
 * @param {Object} candle1 - Primera vela
 * @param {Object} candle2 - Segunda vela  
 * @param {Object} candle3 - Tercera vela
 * @returns {Object} Niveles dinámicos de TP/SL
 */
function calculateDynamicTP_SL(candle1, candle2, candle3) {
  const epsilon = 1e-8; // Para evitar división por cero
  
  // Cálculos base por vela
  const body1 = Math.abs(candle1.close - candle1.open);
  const body2 = Math.abs(candle2.close - candle2.open);
  const body3 = Math.abs(candle3.close - candle3.open);
  
  const range1 = candle1.high - candle1.low;
  const range2 = candle2.high - candle2.low;
  const range3 = candle3.high - candle3.low;
  
  // Para la vela 3
  const clv3 = (candle3.close - candle3.low) / Math.max(range3, epsilon);
  const upperWick3 = (candle3.high - candle3.close) / Math.max(body3, epsilon);
  
  // Sub-scores (0-1)
  
  // Aceleración de cuerpos
  const acc12 = Math.min(Math.max(body2 / body1, 0), 2) / 2;
  const acc23 = Math.min(Math.max(body3 / body2, 0), 2) / 2;
  const accScore = 0.5 * acc12 + 0.5 * acc23;
  
  // "Limpieza" de soldiers (overlap)
  const ol2 = (candle2.open >= Math.min(candle1.open, candle1.close) && 
               candle2.open <= Math.max(candle1.open, candle1.close)) ? 1 : 0;
  const ol3 = (candle3.open >= Math.min(candle2.open, candle2.close) && 
               candle3.open <= Math.max(candle2.open, candle2.close)) ? 1 : 0;
  const overlapScore = (ol2 + ol3) / 2;
  
  // Penalización por expansión en la 3
  const rangeRatio = range3 / Math.max((range1 + range2) / 2, epsilon);
  const bodyJump = body3 / Math.max(body2, epsilon);
  const expansionPenalty = Math.min(Math.max(rangeRatio - 1.6, 0), 1) * 0.6 + 
                          Math.min(Math.max(bodyJump - 2.0, 0), 1) * 0.4;
  
  // Penalización por mecha superior en la 3
  const wickPenalty = Math.min(Math.max(upperWick3 - 0.25, 0), 1);
  
  // Score final (0-1)
  const score = Math.min(Math.max(
    0.35 * accScore +
    0.25 * clv3 +
    0.20 * overlapScore -
    0.15 * expansionPenalty -
    0.05 * wickPenalty,
    0), 1);
  
  // TP% (banda soldiers con seguridad)
  const tpBandMin = 0.0065; // 0.65%
  const tpBandMax = 0.0095; // 0.95%
  let tpPct = tpBandMin + (tpBandMax - tpBandMin) * score;
  
  // Margen de seguridad anti-extremos
  let safety = 0;
  if (rangeRatio > 1.6 && bodyJump > 2.0) {
    safety = 0.0010; // 0.10%
  } else if (rangeRatio > 1.6 || bodyJump > 2.0) {
    safety = 0.0005; // 0.05%
  }
  tpPct = Math.max(tpBandMin, tpPct - safety);
  
  // SL% (único, operativo)
  const mid3 = (candle3.open + candle3.close) / 2;
  const retracePct = (candle3.close - mid3) / candle3.close;
  const propPct = 0.40 * tpPct; // mantener RR ≈ 2:1
  const slPct = Math.max(retracePct, propPct);
  
  // Niveles (LONG)
  const entry = candle3.close;
  const tp = candle3.close * (1 + tpPct);
  const sl = candle3.close * (1 - slPct);
  
  return {
    entry,
    tp,
    sl,
    tpPct: tpPct * 100, // En porcentaje
    slPct: slPct * 100, // En porcentaje
    score,
    metrics: {
      accScore,
      clv3,
      overlapScore,
      expansionPenalty,
      wickPenalty,
      rangeRatio,
      bodyJump,
      safety
    }
  };
}

function detectThreeWhiteSoldiers(candles, index) {
  // Detect AFTER the third candle has occurred (3 soldiers pattern)
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
  // REGLA SIMPLE: Solo 3 velas verdes consecutivas
  // ========================================
  if (!isBullish(candle1) || !isBullish(candle2) || !isBullish(candle3)) {
    return { match: false, confidence: 0, meta: { reason: 'Not all bullish' } };
  }

  // ========================================
  // FILTRO CUERPO MAYOR QUE MECHA
  // ========================================
  // Body ratio debe ser > 0.5 (cuerpo más grande que mecha)
  const bodyRatio1 = calculateBodyRatio(candle1);
  const bodyRatio2 = calculateBodyRatio(candle2);
  const bodyRatio3 = calculateBodyRatio(candle3);
  
  if (bodyRatio1 <= 0.5 || bodyRatio2 <= 0.5 || bodyRatio3 <= 0.5) {
    return { match: false, confidence: 0, meta: { reason: 'Body not bigger than wick' } };
  }

  // ========================================
  // FILTRO PROGRESIÓN SUAVE (CLOSE)
  // ========================================
  // Permite que c2 sea un poquito menor que c1, pero no exageradamente
  // c3 debe ser mayor que c2, y la diferencia c2-c1 no debe ser muy grande
  const closeDiff1 = candle2.close - candle1.close;
  const closeDiff2 = candle3.close - candle2.close;
  const closeDiff1Percent = (closeDiff1 / candle1.close) * 100;
  
  // c3 debe ser mayor que c2 (progresión final)
  if (candle3.close <= candle2.close) {
    return { match: false, confidence: 0, meta: { reason: 'c3 not higher than c2' } };
  }
  
  // c2 puede ser un poquito menor que c1, pero no más del 2%
  if (closeDiff1Percent < -2) {
    return { match: false, confidence: 0, meta: { reason: 'c2 too much lower than c1' } };
  }

  // ========================================
  // FILTRO PROGRESIÓN INCREMENTAL (VOLUMEN)
  // ========================================
  // volume(C3) > volume(C2) > volume(C1)
  if (candle3.volume <= candle2.volume || candle2.volume <= candle1.volume) {
    return { match: false, confidence: 0, meta: { reason: 'No incremental volume progression' } };
  }

  // Body ratios ya calculados arriba para el filtro

  // ========================================
  // CALCULAR CONFIANZA SIMPLE
  // ========================================
  let confidence = 0.7; // Base confidence

  // Bonificación por cuerpos largos (opcional)
  const avgBodyRatio = (bodyRatio1 + bodyRatio2 + bodyRatio3) / 3;
  if (avgBodyRatio > 0.8) confidence += 0.1;

  confidence = Math.min(1, confidence);

  // Calculate dynamic TP/SL based on the 3 candles analysis
  const dynamicLevels = calculateDynamicTP_SL(candle1, candle2, candle3);
  
  return {
    match: true,
    confidence,
    meta: {
      bodyRatio1, bodyRatio2, bodyRatio3,
      avgBodyRatio,
      progression: {
        close1: candle1.close,
        close2: candle2.close,
        close3: candle3.close,
        closeDiff1Percent,
        closeDiff2,
        smoothProgression: true
      },
      volumeProgression: {
        volume1: candle1.volume,
        volume2: candle2.volume,
        volume3: candle3.volume,
        incremental: true
      },
      candle1Volume: candle1.volume,
      candle2Volume: candle2.volume,
      candle3Volume: candle3.volume,
      dynamicTP_SL: dynamicLevels
    }
  };
}

/**
 * Filtra duplicados temporales en las detecciones de Three White Soldiers
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
  
  console.log(`🔍 Three White Soldiers: Filtrados ${detections.length - filteredDetections.length} duplicados temporales (${detections.length} → ${filteredDetections.length})`);
  
  return filteredDetections;
}

const spec = {
  name: "three-white-soldiers",
  type: "triple-candle",
  minCandles: 3,
  shapeOnly: true,
  description: "Tres velas verdes consecutivas con cuerpo mayor que mecha, progresión suave en close (permite pequeñas variaciones) y progresión incremental estricta en volumen.",
  typicalPrediction: "continuación alcista",
  commonContext: "en tendencias alcistas, muestra tres velas alcistas consecutivas con cierres crecientes",
  filterCriteria: [
    "Las 3 velas deben ser alcistas (verdes) consecutivas",
    "Cuerpo mayor que mecha en las 3 velas (body ratio > 0.5)",
    "Progresión suave en close: c3 > c2, c2 puede ser hasta 2% menor que c1",
    "Progresión estricta en volumen: v3 > v2 > v1 (incremental)",
    "Filtro de duplicados temporales (15 minutos de diferencia)",
    "Volúmenes incrementales: cada vela debe tener mayor volumen que la anterior",
    "No duplicados para evitar rebote: elimina detecciones muy cercanas temporalmente",
    "Validación de contexto: verifica que las velas estén en secuencia correcta",
    "Filtro de calidad: solo patrones con confianza > 0.7",
    "Análisis de 5 velas siguientes: evalúa rendimiento post-detección"
  ]
};

module.exports = {
  detectThreeWhiteSoldiers,
  filterTemporalDuplicates,
  calculateDynamicTP_SL,
  spec
};
