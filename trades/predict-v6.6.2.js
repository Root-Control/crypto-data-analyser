require('dotenv').config();
const { getData } = require('./get-data');

function pct(a, b) {
  return (a - b) / b;
}

function fmtNumber(n, decimals = 2) {
  return Number(n.toFixed(decimals));
}

function computeATR(candles, period = 14) {
  if (candles.length < period + 1) return undefined;
  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close),
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  const atr = recent.reduce((a, b) => a + b, 0) / recent.length;
  return atr;
}

function verifyCandleIntervals(candles, timeframe = '15m') {
  console.log(`[verifyCandleIntervals] Verificando intervalos de ${timeframe} en ${candles.length} velas...`);
  
  let gapsFound = 0;
  const expectedInterval = 15 * 60; // 15 minutos en segundos
  
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const intervalSeconds = (curr.openTime - prev.openTime) / 1000;
    
    if (intervalSeconds !== expectedInterval) {
      gapsFound++;
      console.log(`[verifyCandleIntervals] ⚠️ GAP #${gapsFound} en índice ${i}: ${intervalSeconds}s (esperado: ${expectedInterval}s)`);
    }
  }
  
  if (gapsFound === 0) {
    console.log(`[verifyCandleIntervals] ✅ Intervalos perfectos: ${candles.length} velas con 15min exactos`);
  } else {
    console.log(`[verifyCandleIntervals] ⚠️ Encontrados ${gapsFound} gaps en ${candles.length} velas`);
  }
  
  return gapsFound === 0;
}

function buildSignal(idBase, candle, side, entry, sl, tp1, tp2, rr, eventScore, directionScore, votes, volumeRatio, tp1Pct = null, slPct = null) {
  // 🚨 FIX: Calcular porcentajes correctos si no se proporcionan
  const tp1PctFinal = tp1Pct !== null ? tp1Pct : 
    (side === 'LONG' ? ((tp1 - entry) / entry * 100) : ((entry - tp1) / entry * 100));
  
  const slPctFinal = slPct !== null ? slPct : 
    (side === 'LONG' ? ((entry - sl) / entry * 100) : ((sl - entry) / entry * 100));

  return {
    id: `${idBase}-${candle.openTime}`,
    dtISO: candle.openTimeISO,
    side,
    entry: fmtNumber(entry),
    sl: fmtNumber(sl),
    tp1: fmtNumber(tp1),
    tp2: tp2 !== undefined ? fmtNumber(tp2) : undefined,
    rr: fmtNumber(rr, 2),
    tp1Pct: fmtNumber(tp1PctFinal, 3), // 🚨 FIX: Porcentaje correcto
    slPct: fmtNumber(slPctFinal, 3),   // 🚨 FIX: Porcentaje correcto
    eventScore: fmtNumber(eventScore, 3),
    directionScore: fmtNumber(directionScore, 3),
    volumeRatio: fmtNumber(volumeRatio, 2),
    votes,
    targetsSource: 'atr',
    flags: [],
  };
}

async function predictV662({ symbol, quantity = 1000, fromISO, previousCandles = 500, timeframe = '15m', regime = 'low', maxSignalsPer1000 = 6 }) {
  // 🚨 STEP 1: getData ya no llamará a previousCandles jamás, solo obtendrá la cantidad exacta
  const candles = await getData(symbol, quantity, fromISO, 0, timeframe);
  if (!candles.length) return [];

  // 🚨 STEP 2: Verificar intervalos de velas usando helper
  verifyCandleIntervals(candles, timeframe);

  const allSignals = [];

  // Si quantity > 1000, dividir en chunks de 1000 velas
  if (quantity > 1000) {
    const chunkSize = 1000;
    const numChunks = Math.ceil(quantity / chunkSize);
    
    console.log(`[predictV662] Dividiendo ${quantity} velas en ${numChunks} chunks de ${chunkSize} velas cada uno`);
    
    for (let chunk = 0; chunk < numChunks; chunk++) {
      const startIdx = chunk * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, candles.length);
      
      // Obtener chunk actual
      const chunkCandles = candles.slice(startIdx, endIdx);
      console.log(`[predictV662] Chunk ${chunk + 1}: ${chunkCandles.length} velas (${startIdx}-${endIdx-1})`);
      
      // 🚨 STEP 3: Llamar a Redis con timestamp de primera vela - 15 minutos
      if (chunkCandles.length > 0) {
        const firstCandleTime = chunkCandles[0].openTime;
        const fifteenMinutesAgo = firstCandleTime - (15 * 60 * 1000);
        const fifteenMinutesAgoISO = new Date(fifteenMinutesAgo).toISOString();
        
        console.log(`[predictV662] Obteniendo datos desde: ${fifteenMinutesAgoISO}`);
        
        // Obtener datos anteriores de Redis
        const previousData = await getData(symbol, previousCandles, fifteenMinutesAgoISO, 0, timeframe);
        console.log(`[predictV662] Obtenidas ${previousData.length} velas anteriores`);
        
        // Mergear con unshift
        const mergedCandles = [...previousData, ...chunkCandles];
        console.log(`[predictV662] Mergeado: ${mergedCandles.length} velas totales`);
        
        // Verificar gaps en los datos mergeados
        verifyCandleIntervals(mergedCandles, timeframe);
        
        // Procesar chunk con datos mergeados
        const chunkQuantity = Math.min(chunkSize, endIdx - startIdx);
        const chunkSignals = processChunk(symbol, mergedCandles, previousCandles, maxSignalsPer1000, chunk, regime, chunkQuantity);
        allSignals.push(...chunkSignals);
      }
    }
    
    return allSignals.sort((a, b) => new Date(a.dtISO) - new Date(b.dtISO));
  } else {
    // Procesamiento normal para quantity <= 1000
    return processChunk(symbol, candles, previousCandles, maxSignalsPer1000, 0, regime, quantity);
  }
}

function processChunk(symbol, candles, previousCandles, maxSignalsPer1000, chunkId, regime = 'low', quantity = 1000) {
  const signals = [];

  // Simple placeholder selection: look for momentum bursts with ATR-filtered space
  const atr = computeATR(candles, 14) || 0;
  console.log('===============================================');
  console.log(candles.length);
  if (atr <= 0) return [];

  // 🚨 FIX: Calcular el offset correcto para cada chunk
  // Si chunkId es 0, empezar desde previousCandles (500)
  // Si chunkId > 0, empezar desde previousCandles (500) para procesar solo las velas nuevas
  const startOffset = previousCandles;
  const endOffset = candles.length;
  
  console.log(`[processChunk] Chunk ${chunkId}: procesando velas ${startOffset}-${endOffset-1} de ${candles.length} total`);
  
  for (let i = startOffset; i < endOffset; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];
    if (!p) continue;

    const change = pct(c.close, p.close);
    const range = c.high - c.low;
    const body = Math.abs(c.close - c.open);

    // naive momentum condition (to be replaced with v6.6.2 real scoring)
    const bullish = change > 0.002 && body > 0.5 * range;
    const bearish = change < -0.002 && body > 0.5 * range;

    if (!(bullish || bearish)) continue;

    const side = bullish ? 'LONG' : 'SHORT';
    const entry = c.close;
    const baseSl = bullish ? c.low : c.high;
    const rrTarget = parseFloat(process.env.TP_MULTIPLIER) || 1.0; // Use TP_MULTIPLIER from env
    const baseRisk = Math.abs(entry - baseSl);
    if (baseRisk <= 0) continue;
    
    // Apply multiplier to both SL and TP
    const multiplier = parseFloat(process.env.TP_MULTIPLIER) || 1.0;
    const adjustedRisk = baseRisk * multiplier;
    let sl = bullish ? entry - adjustedRisk : entry + adjustedRisk;
    
    // 🛡️ PATCH: SL floor basado en 0.8xATR (lo que sea mayor)
    const atrFloor = atr * 0.8; // 0.8xATR como piso mínimo
    const slDistancePct = Math.abs(entry - sl) / entry * 100;
    const atrFloorDistance = Math.abs(atrFloor) / entry * 100;
    
    // Aplicar SL floor: usar el mayor entre SL calculado y 0.8xATR
    if (atrFloorDistance > slDistancePct) {
      sl = bullish ? entry - atrFloor : entry + atrFloor;
    }
    
    // 🛡️ MITIGACIÓN: SL máximo del 1.5% para evitar pérdidas excesivas
    const maxSLPct = 1.5;
    const finalSLDistancePct = Math.abs(entry - sl) / entry * 100;
    if (finalSLDistancePct > maxSLPct) {
      sl = bullish ? entry * (1 - maxSLPct/100) : entry * (1 + maxSLPct/100);
    }
    
    // 🛡️ PATCH: Targets basados en ATR según régimen
    const tp1ATRMult = regime === 'low' ? 0.7 : 1.0; // low: 0.7, trend: 1.0
    const tp2RR = regime === 'low' ? 1.6 : 2.0; // low: 1.6, trend: 2.0
    
    // TP1 basado en ATR
    const tp1ATR = bullish ? entry + (atr * tp1ATRMult) : entry - (atr * tp1ATRMult);
    
    // TP2 basado en RR objetivo
    const tp2 = bullish ? entry + tp2RR * Math.abs(entry - sl) : entry - tp2RR * Math.abs(entry - sl);
    
    // 🚨 FIX: Unificar TP/SL efectivos - usar los mismos valores para todas las métricas
    const tp1Effective = tp1ATR;
    const slEffective = sl;
    
    // 🚨 FIX: Cálculo de % correcto (lado-sensible)
    const tp1Pct = bullish ? 
      ((tp1Effective - entry) / entry * 100) : 
      ((entry - tp1Effective) / entry * 100);
    
    const slPct = bullish ? 
      ((entry - slEffective) / entry * 100) : 
      ((slEffective - entry) / entry * 100);
    
    // 🚨 FIX: RR correcto usando valores efectivos
    const rr = Math.abs((tp1Effective - entry) / (entry - slEffective));
    
    // Usar valores efectivos
    let tp1 = tp1Effective;

    const eventScore = Math.min(1, body / (atr || 1));
    const directionScore = Math.min(1, Math.abs(change) / 0.01); // Normalize to 0-1 range
    const volumeRatio = c.volume / (candles.slice(-20).reduce((sum, candle) => sum + candle.volume, 0) / 20); // 20-period avg
    
    // 🛡️ PATCH: Filtros de volumen más estrictos
    if (volumeRatio > 15) continue; // Evitar señales con volumen >15x el promedio
    // 🛡️ PATCH: volRatioMin adaptativo según cantidad de velas
    const volRatioMin = quantity > 2000 ? 1.5 : 1.2; // Más estricto para períodos largos
    if (volumeRatio < volRatioMin) continue;
    
    // 🛡️ PATCH: zVolMin: 0.5 (antes 0.2)
    const avgVolume = candles.slice(-20).reduce((sum, candle) => sum + candle.volume, 0) / 20;
    const zVol = (c.volume - avgVolume) / (Math.sqrt(avgVolume) || 1);
    if (zVol < 0.5) continue;
    
    // 🛡️ PATCH: tickVolPctlMin: 55 (antes 40)
    const recentVolumes = candles.slice(-100).map(candle => candle.volume).sort((a, b) => a - b);
    const volumePercentile = (recentVolumes.filter(vol => vol <= c.volume).length / recentVolumes.length) * 100;
    if (volumePercentile < 55) continue;
    
    // 🚨 FIX: requireLive=true - NO operar con volumeFallback para super entradas
    const isVolumeFallback = c.volume < avgVolume * 0.8; // Detectar fallback
    if (isVolumeFallback) {
      console.log(`[VOLUME_FALLBACK] Señal bloqueada - volumen: ${c.volume.toFixed(0)}, avg: ${avgVolume.toFixed(0)}`);
      continue; // Bloquear señales con volumeFallback
    }
    
    // 🛡️ MITIGACIÓN: Filtro de horarios para evitar señales en momentos de alta volatilidad
    const hour = new Date(c.openTime).getUTCHours();
    if (hour >= 13 && hour <= 16) continue; // Evitar horario crítico UTC (13:00-16:00)
    
    // 🛡️ PATCH: Threshold de dirección adaptativo según cantidad de velas
    const directionThreshold = quantity > 2000 ? 0.65 : 0.55; // Más estricto para períodos largos
    if (directionScore < directionThreshold) continue;
    
    // 🛡️ PATCH: Cap score de dirección a 0.95 para evitar overconfidence
    const cappedDirectionScore = Math.min(directionScore, 0.95);
    
    // 🛡️ PATCH: Filtros de espacio más estrictos
    const tp1Distance = Math.abs(tp1 - entry);
    const oppositeLevel = bullish ? c.high : c.low;
    const obstacleDistance = Math.abs(oppositeLevel - entry);
    const minObstacleDistVsTP1 = 0.6; // obstáculo opuesto ≥ 60% de TP1
    
    if (obstacleDistance < tp1Distance * minObstacleDistVsTP1) {
      // Reducir TP1 para cumplir con el espacio mínimo
      const adjustedTP1Distance = obstacleDistance / minObstacleDistVsTP1;
      if (adjustedTP1Distance < tp1Distance * 0.5) continue; // Skip si el ajuste es muy grande
      tp1 = bullish ? entry + adjustedTP1Distance : entry - adjustedTP1Distance;
    }
    
    // 🚨 FIX: Regla anti-squeeze para SHORT
    if (!bullish) { // Solo para SHORT
      const nextCandle = candles[i + 1];
      if (nextCandle) {
        const wickHighPct = ((nextCandle.high - nextCandle.close) / nextCandle.close * 100);
        const atrPct = (atr / entry * 100);
        if (wickHighPct > 0.5 * atrPct) {
          console.log(`[ANTI_SQUEEZE] SHORT bloqueado - wickHigh: ${wickHighPct.toFixed(2)}%, ATR: ${atrPct.toFixed(2)}%`);
          continue; // Invalida SHORT si hay squeeze inmediato
        }
      }
    }
    
    // 🛡️ MITIGACIÓN: Gestión de riesgo progresiva - reducir RR mínimo para SL amplios
    const finalRR = slDistancePct > 1.0 ? Math.max(rr, 1.2) : rr; // RR mínimo 1.2 para SL >1%
    
    const votes = { momentum: fmtNumber(directionScore, 3), book: 0.3, flow: 0.2, vwap: 0.1 };

    signals.push(buildSignal(symbol, c, side, entry, sl, tp1, tp2, finalRR, eventScore, directionScore, votes, volumeRatio, tp1Pct, slPct));
  }

  // clustering rudimentary: keep top by composite score and enforce max count
  const withScore = signals.map(s => ({
    s,
    composite: 0.6 * s.eventScore + 0.3 * s.directionScore + 0.1 * (s.votes?.momentum ?? 0),
  }));
  withScore.sort((a, b) => b.composite - a.composite);
  
  const limited = withScore.slice(0, Math.min(maxSignalsPer1000, withScore.length)).map(x => x.s);
  
  console.log(`[predictV662] Chunk ${chunkId + 1}: ${signals.length} señales candidatas → ${limited.length} señales emitidas`);
  
  return limited;
}

module.exports = { predictV662 };
