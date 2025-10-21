#!/usr/bin/env node

/**
 * Detección automática de régimen de mercado basada en volatilidad
 * Analiza el ATR y otros indicadores para determinar si el mercado está en:
 * - low: baja volatilidad
 * - mid: volatilidad media  
 * - high: alta volatilidad
 */

function computeATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
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
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function computeVolatility(candles, period = 20) {
  if (candles.length < period) return null;
  
  const returns = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const returnPct = (c.close - p.close) / p.close;
    returns.push(returnPct);
  }
  
  const recentReturns = returns.slice(-period);
  const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
  const variance = recentReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentReturns.length;
  
  return Math.sqrt(variance);
}

function detectRegime(candles) {
  if (!candles || candles.length < 50) {
    console.log('⚠️  Insuficientes datos para detectar régimen. Usando "low" por defecto.');
    return 'low';
  }

  const atr = computeATR(candles, 14);
  const volatility = computeVolatility(candles, 20);
  const currentPrice = candles[candles.length - 1].close;
  
  if (!atr || !volatility) {
    console.log('⚠️  Error calculando indicadores. Usando "low" por defecto.');
    return 'low';
  }

  // Normalizar ATR como porcentaje del precio
  const atrPct = (atr / currentPrice) * 100;
  
  // Umbrales basados en análisis empírico (ajustables)
  const atrThresholds = {
    low: 0.5,   // < 0.5% = baja volatilidad
    mid: 1.0,   // 0.5-1.0% = volatilidad media
    // > 1.0% = alta volatilidad
  };
  
  const volThresholds = {
    low: 0.01,  // < 1% = baja volatilidad
    mid: 0.02,  // 1-2% = volatilidad media  
    // > 2% = alta volatilidad
  };

  let regime;
  let reason;

  if (atrPct < atrThresholds.low && volatility < volThresholds.low) {
    regime = 'low';
    reason = `ATR: ${atrPct.toFixed(3)}%, Volatilidad: ${(volatility * 100).toFixed(3)}%`;
  } else if (atrPct < atrThresholds.mid && volatility < volThresholds.mid) {
    regime = 'mid';
    reason = `ATR: ${atrPct.toFixed(3)}%, Volatilidad: ${(volatility * 100).toFixed(3)}%`;
  } else {
    regime = 'high';
    reason = `ATR: ${atrPct.toFixed(3)}%, Volatilidad: ${(volatility * 100).toFixed(3)}%`;
  }

  console.log(`📊 Régimen detectado: ${regime.toUpperCase()}`);
  console.log(`📈 Razón: ${reason}`);
  
  return regime;
}

// Función para usar desde otros módulos
function getRegimeFromCandles(candles) {
  return detectRegime(candles);
}

module.exports = {
  detectRegime,
  getRegimeFromCandles,
  computeATR,
  computeVolatility
};

// Si se ejecuta directamente, mostrar ayuda
if (require.main === module) {
  console.log('🔍 Detector de Régimen de Mercado');
  console.log('Este módulo detecta automáticamente el régimen de mercado basado en volatilidad.');
  console.log('Para usarlo desde otros scripts:');
  console.log('const { getRegimeFromCandles } = require("./detect-regime");');
  console.log('const regime = getRegimeFromCandles(candles);');
}
