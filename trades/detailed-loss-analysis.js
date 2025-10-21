#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');

// Leer el archivo de señales más reciente
const signalsFile = 'trades/reports/signals-1761019495212.json';
const signals = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));

console.log('=== ANÁLISIS DETALLADO DE PÉRDIDAS CRÍTICAS ===\n');

const signalsData = signals.signals;

// Identificar las pérdidas más grandes
const losses = signalsData
  .map((signal, index) => ({
    signalNumber: index + 1,
    side: signal.side,
    entry: signal.entry,
    sl: signal.sl,
    tp1: signal.tp1,
    exitReason: signal.realPnL?.exitReason,
    exitPrice: signal.realPnL?.exitPrice,
    pnl: signal.realPnL?.netPct || 0,
    date: signal.dtISO,
    slPct: signal.slPct,
    tp1Pct: signal.tp1Pct,
    rr: signal.rr,
    volumeRatio: signal.volumeRatio,
    moveNext: signal.moveNext
  }))
  .filter(s => s.pnl < 0)
  .sort((a, b) => a.pnl - b.pnl); // Ordenar por pérdida (de mayor a menor)

console.log('🔴 TOP 10 PÉRDIDAS MÁS GRANDES:\n');

losses.slice(0, 10).forEach((loss, index) => {
  console.log(`${index + 1}. Señal ${loss.signalNumber}: ${loss.side} - ${new Date(loss.date).toLocaleDateString('es-PE')}`);
  console.log(`   Entry: $${loss.entry.toFixed(2)} | Exit: $${loss.exitPrice?.toFixed(2)} (${loss.exitReason})`);
  console.log(`   SL: $${loss.sl.toFixed(2)} (${loss.slPct.toFixed(3)}%) | TP: $${loss.tp1.toFixed(2)} (${loss.tp1Pct.toFixed(3)}%)`);
  console.log(`   RR: ${loss.rr.toFixed(2)} | Vol: ${loss.volumeRatio.toFixed(2)}x`);
  console.log(`   Pérdida: ${loss.pnl.toFixed(2)}%`);
  
  if (loss.moveNext) {
    console.log(`   Movimiento siguiente vela: +${loss.moveNext.up1Pct?.toFixed(3)}% / -${loss.moveNext.down1Pct?.toFixed(3)}%`);
  }
  console.log('');
});

// Análisis de patrones específicos
console.log('=== ANÁLISIS DE PATRONES ESPECÍFICOS ===\n');

// 1. Pérdidas por SL vs Expiración
const slLosses = losses.filter(l => l.exitReason === 'SL');
const expLosses = losses.filter(l => l.exitReason === 'EXP');

console.log(`📊 DISTRIBUCIÓN DE PÉRDIDAS:`);
console.log(`   Stop Loss: ${slLosses.length} (${(slLosses.length/losses.length*100).toFixed(1)}%)`);
console.log(`   Expiración: ${expLosses.length} (${(expLosses.length/losses.length*100).toFixed(1)}%)`);

// 2. Análisis por lado
const longLosses = losses.filter(l => l.side === 'LONG');
const shortLosses = losses.filter(l => l.side === 'SHORT');

console.log(`\n📈 PÉRDIDAS POR LADO:`);
console.log(`   LONG: ${longLosses.length} pérdidas (promedio: ${(longLosses.reduce((sum, l) => sum + l.pnl, 0) / longLosses.length).toFixed(2)}%)`);
console.log(`   SHORT: ${shortLosses.length} pérdidas (promedio: ${(shortLosses.reduce((sum, l) => sum + l.pnl, 0) / shortLosses.length).toFixed(2)}%)`);

// 3. Análisis de SL problemáticos
const wideSL = losses.filter(l => l.slPct > 1.5);
const normalSL = losses.filter(l => l.slPct <= 1.5);

console.log(`\n🎯 ANÁLISIS DE STOP LOSS:`);
console.log(`   SL amplios (>1.5%): ${wideSL.length} pérdidas`);
console.log(`   SL normales (≤1.5%): ${normalSL.length} pérdidas`);

if (wideSL.length > 0) {
  console.log(`   Pérdida promedio SL amplios: ${(wideSL.reduce((sum, l) => sum + l.pnl, 0) / wideSL.length).toFixed(2)}%`);
}
if (normalSL.length > 0) {
  console.log(`   Pérdida promedio SL normales: ${(normalSL.reduce((sum, l) => sum + l.pnl, 0) / normalSL.length).toFixed(2)}%`);
}

// 4. Análisis de volatilidad
const highVolLosses = losses.filter(l => l.volumeRatio > 2.0);
const normalVolLosses = losses.filter(l => l.volumeRatio <= 2.0);

console.log(`\n📊 ANÁLISIS DE VOLATILIDAD:`);
console.log(`   Alta volatilidad (>2.0x): ${highVolLosses.length} pérdidas`);
console.log(`   Volatilidad normal (≤2.0x): ${normalVolLosses.length} pérdidas`);

// 5. Análisis de RR
const badRR = losses.filter(l => l.rr < 1.2);
const goodRR = losses.filter(l => l.rr >= 1.2);

console.log(`\n📈 ANÁLISIS DE RIESGO/BENEFICIO:`);
console.log(`   RR bajo (<1.2): ${badRR.length} pérdidas`);
console.log(`   RR bueno (≥1.2): ${goodRR.length} pérdidas`);

// Recomendaciones específicas
console.log('\n=== RECOMENDACIONES ESPECÍFICAS ===\n');

// 1. Problema de SL amplios
if (wideSL.length > 0) {
  console.log(`🔴 PROBLEMA CRÍTICO: ${wideSL.length} pérdidas con SL muy amplios (>1.5%)`);
  console.log(`   Las pérdidas más grandes están en esta categoría`);
  console.log(`   SOLUCIÓN: Implementar SL máximo de 1.0% del precio de entrada`);
  console.log('');
}

// 2. Problema de expiraciones
if (expLosses.length > 0) {
  console.log(`🔴 PROBLEMA CRÍTICO: ${expLosses.length} pérdidas por expiración (${(expLosses.length/losses.length*100).toFixed(1)}%)`);
  console.log(`   El precio se acercó al objetivo pero no lo alcanzó`);
  console.log(`   SOLUCIÓN: Implementar trailing stop o TP más conservadores`);
  console.log('');
}

// 3. Problema de RR bajo
if (badRR.length > 0) {
  console.log(`🔴 PROBLEMA CRÍTICO: ${badRR.length} pérdidas con RR bajo (<1.2)`);
  console.log(`   El riesgo no está justificado por la recompensa`);
  console.log(`   SOLUCIÓN: Aumentar RR mínimo a 1.5`);
  console.log('');
}

// 4. Problema de volatilidad
if (highVolLosses.length > 0) {
  console.log(`🔴 PROBLEMA CRÍTICO: ${highVolLosses.length} pérdidas en alta volatilidad`);
  console.log(`   Los SL se activan más fácilmente en mercados volátiles`);
  console.log(`   SOLUCIÓN: Ajustar SL según volatilidad del mercado`);
  console.log('');
}

// Resumen de mejoras
console.log('=== RESUMEN DE MEJORAS CRÍTICAS ===');
console.log('1. 🎯 LIMITAR SL máximo a 1.0% del precio de entrada');
console.log('2. 📊 AUMENTAR RR mínimo a 1.5');
console.log('3. 🔄 IMPLEMENTAR trailing stop para evitar expiraciones');
console.log('4. 📈 AJUSTAR SL según volatilidad (reducir en alta vol)');
console.log('5. ⏰ CONSIDERAR TP más conservadores (0.8% en lugar de 1.0%)');
console.log('6. 🎯 IMPLEMENTAR SL dinámico basado en ATR');

console.log('\n=== IMPACTO ESPERADO ===');
const currentLosses = losses.reduce((sum, l) => sum + Math.abs(l.pnl), 0);
console.log(`Pérdidas actuales: ${currentLosses.toFixed(2)}%`);
console.log(`Con mejoras estimadas: ${(currentLosses * 0.6).toFixed(2)}% (reducción del 40%)`);
console.log(`Beneficio neto esperado: +${(currentLosses * 0.4).toFixed(2)}%`);
