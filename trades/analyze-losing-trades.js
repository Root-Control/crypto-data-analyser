#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Read the most recent signals file
const signalsFile = 'trades/reports/signals-1761021488108.json';
const signalsDoc = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));
const signalsData = signalsDoc.signals;

console.log('=== ANÁLISIS DE TRADES PERDEDORES - 20,000 VELAS CON MEJORAS ===\n');

const losingTrades = [];
const winningTrades = [];
const expirationTrades = [];

signalsData.forEach((signal, index) => {
  const pnl = signal.realPnL?.netPct || 0;
  const exitReason = signal.realPnL?.exitReason;
  
  if (pnl < 0) {
    losingTrades.push({
      signalNumber: index + 1,
      side: signal.side,
      entry: signal.entry,
      sl: signal.sl,
      tp1: signal.tp1,
      exitReason: exitReason,
      exitPrice: signal.realPnL?.exitPrice,
      pnl: pnl,
      date: signal.dtISO,
      slDistance: Math.abs(signal.entry - signal.sl),
      slDistancePct: Math.abs(signal.entry - signal.sl) / signal.entry * 100,
      tpDistance: Math.abs(signal.tp1 - signal.entry),
      tpDistancePct: Math.abs(signal.tp1 - signal.entry) / signal.entry * 100,
      rr: signal.rr,
      volumeRatio: signal.volumeRatio,
      slPct: signal.slPct,
      tp1Pct: signal.tp1Pct,
      candleNumber: signal.realBehavior?.candleNumber,
      maxCandle: signal.realBehavior?.maxCandle
    });
  } else if (pnl > 0) {
    winningTrades.push({
      signalNumber: index + 1,
      side: signal.side,
      exitReason: exitReason,
      pnl: pnl,
      candleNumber: signal.realBehavior?.candleNumber
    });
  }
  
  if (exitReason === 'EXP') {
    expirationTrades.push({
      signalNumber: index + 1,
      side: signal.side,
      pnl: pnl,
      candleNumber: signal.realBehavior?.candleNumber
    });
  }
});

console.log(`📊 ESTADÍSTICAS GENERALES:`);
console.log(`Total de señales: ${signalsData.length}`);
console.log(`Trades perdedores: ${losingTrades.length} (${(losingTrades.length/signalsData.length*100).toFixed(1)}%)`);
console.log(`Trades ganadores: ${winningTrades.length} (${(winningTrades.length/signalsData.length*100).toFixed(1)}%)`);
console.log(`Trades por expiración: ${expirationTrades.length} (${(expirationTrades.length/signalsData.length*100).toFixed(1)}%)\n`);

// Análisis por tipo de salida
const slLosses = losingTrades.filter(t => t.exitReason === 'SL');
const expLosses = losingTrades.filter(t => t.exitReason === 'EXP');

console.log(`🔴 PÉRDIDAS POR STOP LOSS: ${slLosses.length}`);
console.log(`🔴 PÉRDIDAS POR EXPIRACIÓN: ${expLosses.length}\n`);

// Análisis de SL muy amplios
const wideSL = losingTrades.filter(t => t.slDistancePct > 2);
const veryWideSL = losingTrades.filter(t => t.slDistancePct > 3);

console.log(`⚠️  SL MUY AMPLIOS (>2%): ${wideSL.length}`);
console.log(`🚨 SL EXTREMADAMENTE AMPLIOS (>3%): ${veryWideSL.length}\n`);

// Top 10 peores pérdidas
const worstLosses = losingTrades.sort((a, b) => a.pnl - b.pnl).slice(0, 10);

console.log(`🔴 TOP 10 PÉRDIDAS MÁS GRANDES:\n`);
worstLosses.forEach((loss, idx) => {
  console.log(`${idx + 1}. Señal ${loss.signalNumber}: ${loss.side} - ${new Date(loss.date).toLocaleDateString('es-PE')}`);
  console.log(`   Entry: $${loss.entry.toFixed(2)} | Exit: $${loss.exitPrice.toFixed(2)} (${loss.exitReason})`);
  console.log(`   SL: $${loss.sl.toFixed(2)} (${loss.slDistancePct.toFixed(2)}%) | TP: $${loss.tp1.toFixed(2)} (${loss.tp1Pct.toFixed(2)}%)`);
  console.log(`   RR: ${loss.rr.toFixed(2)} | Vol: ${loss.volumeRatio.toFixed(2)}x`);
  console.log(`   Pérdida: ${loss.pnl.toFixed(2)}% | Vela: ${loss.candleNumber || 'N/A'}\n`);
});

// Análisis por lado
const longLosses = losingTrades.filter(t => t.side === 'LONG');
const shortLosses = losingTrades.filter(t => t.side === 'SHORT');

console.log(`📈 PÉRDIDAS LONG: ${longLosses.length} (${(longLosses.length/losingTrades.length*100).toFixed(1)}%)`);
console.log(`📉 PÉRDIDAS SHORT: ${shortLosses.length} (${(shortLosses.length/losingTrades.length*100).toFixed(1)}%)\n`);

// Análisis de velas de salida
const slByCandle = {};
const expByCandle = {};

slLosses.forEach(loss => {
  const candle = loss.candleNumber || 'N/A';
  slByCandle[candle] = (slByCandle[candle] || 0) + 1;
});

expLosses.forEach(loss => {
  const candle = loss.candleNumber || 'N/A';
  expByCandle[candle] = (expByCandle[candle] || 0) + 1;
});

console.log(`📊 PÉRDIDAS POR STOP LOSS POR VELA:`);
Object.entries(slByCandle).sort((a, b) => b[1] - a[1]).forEach(([candle, count]) => {
  console.log(`   Vela ${candle}: ${count} pérdidas`);
});

console.log(`\n📊 PÉRDIDAS POR EXPIRACIÓN POR VELA:`);
Object.entries(expByCandle).sort((a, b) => b[1] - a[1]).forEach(([candle, count]) => {
  console.log(`   Vela ${candle}: ${count} pérdidas`);
});

// Recomendaciones
console.log(`\n🎯 RECOMENDACIONES PARA MITIGAR PÉRDIDAS:\n`);

if (wideSL.length > 0) {
  console.log(`1. LIMITAR SL MÁXIMO:`);
  console.log(`   - ${wideSL.length} trades tienen SL >2% del precio`);
  console.log(`   - Implementar SL máximo del 1.5% para evitar pérdidas excesivas\n`);
}

if (slLosses.length > expLosses.length) {
  console.log(`2. MEJORAR FILTROS DE ENTRADA:`);
  console.log(`   - ${slLosses.length} pérdidas por SL vs ${expLosses.length} por expiración`);
  console.log(`   - Aumentar umbral de volumeRatio o directionScore\n`);
}

if (worstLosses.length > 0) {
  console.log(`3. STOP LOSS DINÁMICO:`);
  console.log(`   - Implementar SL basado en ATR o volatilidad`);
  console.log(`   - Evitar SL muy amplios en condiciones de alta volatilidad\n`);
}

console.log(`4. GESTIÓN DE RIESGO:`);
console.log(`   - Reducir tamaño de posición en señales con RR < 1.3`);
console.log(`   - Implementar trailing stop después de cierta ganancia\n`);

console.log(`5. FILTROS ADICIONALES:`);
console.log(`   - Evitar señales en horarios de alta volatilidad`);
console.log(`   - Filtro por volumen promedio de las últimas 50 velas\n`);
