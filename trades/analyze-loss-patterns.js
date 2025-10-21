#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');

// Leer el archivo de señales más reciente
const signalsFile = 'trades/reports/signals-1761019495212.json';
const signals = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));

console.log('=== ANÁLISIS DE PATRONES DE PÉRDIDAS - MEJORA DE STOP LOSS ===\n');

const signalsData = signals.signals;
let lossPatterns = {
  stopLoss: [],
  expiration: [],
  totalLosses: 0
};

// Analizar solo las señales perdidas
signalsData.forEach((signal, index) => {
  const pnl = signal.realPnL?.netPct || 0;
  
  if (pnl < 0) {
    lossPatterns.totalLosses++;
    
    const lossInfo = {
      signalNumber: index + 1,
      side: signal.side,
      entry: signal.entry,
      sl: signal.sl,
      tp1: signal.tp1,
      exitReason: signal.realPnL?.exitReason,
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
      tp1Pct: signal.tp1Pct
    };
    
    if (signal.realPnL?.exitReason === 'SL') {
      lossPatterns.stopLoss.push(lossInfo);
    } else if (signal.realPnL?.exitReason === 'EXP') {
      lossPatterns.expiration.push(lossInfo);
    }
  }
});

console.log(`📊 TOTAL DE PÉRDIDAS: ${lossPatterns.totalLosses}`);
console.log(`🔴 STOP LOSS: ${lossPatterns.stopLoss.length} (${(lossPatterns.stopLoss.length/lossPatterns.totalLosses*100).toFixed(1)}%)`);
console.log(`⏰ EXPIRACIÓN: ${lossPatterns.expiration.length} (${(lossPatterns.expiration.length/lossPatterns.totalLosses*100).toFixed(1)}%)`);

// Análisis de Stop Loss
console.log('\n=== ANÁLISIS DE STOP LOSS ===');
if (lossPatterns.stopLoss.length > 0) {
  const slLosses = lossPatterns.stopLoss;
  
  // Estadísticas generales
  const avgSlDistance = slLosses.reduce((sum, s) => sum + s.slDistancePct, 0) / slLosses.length;
  const avgLoss = slLosses.reduce((sum, s) => sum + Math.abs(s.pnl), 0) / slLosses.length;
  const avgRR = slLosses.reduce((sum, s) => sum + s.rr, 0) / slLosses.length;
  
  console.log(`📏 Distancia promedio SL: ${avgSlDistance.toFixed(3)}%`);
  console.log(`💰 Pérdida promedio: ${avgLoss.toFixed(2)}%`);
  console.log(`📊 RR promedio: ${avgRR.toFixed(2)}`);
  
  // Análisis por lado
  const longSL = slLosses.filter(s => s.side === 'LONG');
  const shortSL = slLosses.filter(s => s.side === 'SHORT');
  
  console.log(`\n📈 LONG SL: ${longSL.length} pérdidas`);
  if (longSL.length > 0) {
    const longAvgSl = longSL.reduce((sum, s) => sum + s.slDistancePct, 0) / longSL.length;
    console.log(`   Distancia SL promedio: ${longAvgSl.toFixed(3)}%`);
  }
  
  console.log(`📉 SHORT SL: ${shortSL.length} pérdidas`);
  if (shortSL.length > 0) {
    const shortAvgSl = shortSL.reduce((sum, s) => sum + s.slDistancePct, 0) / shortSL.length;
    console.log(`   Distancia SL promedio: ${shortAvgSl.toFixed(3)}%`);
  }
  
  // Casos problemáticos (SL muy cercanos o muy lejanos)
  const tightSL = slLosses.filter(s => s.slDistancePct < 0.3);
  const wideSL = slLosses.filter(s => s.slDistancePct > 0.7);
  
  console.log(`\n🔍 CASOS PROBLEMÁTICOS:`);
  console.log(`   SL muy ajustados (<0.3%): ${tightSL.length}`);
  console.log(`   SL muy amplios (>0.7%): ${wideSL.length}`);
  
  if (tightSL.length > 0) {
    console.log(`\n⚠️  SL MUY AJUSTADOS (${tightSL.length} casos):`);
    tightSL.forEach(s => {
      console.log(`   Señal ${s.signalNumber}: ${s.side} - SL: ${s.slDistancePct.toFixed(3)}% - Pérdida: ${s.pnl.toFixed(2)}%`);
    });
  }
  
  if (wideSL.length > 0) {
    console.log(`\n⚠️  SL MUY AMPLIOS (${wideSL.length} casos):`);
    wideSL.forEach(s => {
      console.log(`   Señal ${s.signalNumber}: ${s.side} - SL: ${s.slDistancePct.toFixed(3)}% - Pérdida: ${s.pnl.toFixed(2)}%`);
    });
  }
}

// Análisis de Expiración
console.log('\n=== ANÁLISIS DE EXPIRACIONES ===');
if (lossPatterns.expiration.length > 0) {
  const expLosses = lossPatterns.expiration;
  
  // Estadísticas generales
  const avgLoss = expLosses.reduce((sum, s) => sum + Math.abs(s.pnl), 0) / expLosses.length;
  const avgSlDistance = expLosses.reduce((sum, s) => sum + s.slDistancePct, 0) / expLosses.length;
  const avgTpDistance = expLosses.reduce((sum, s) => sum + s.tpDistancePct, 0) / expLosses.length;
  
  console.log(`💰 Pérdida promedio: ${avgLoss.toFixed(2)}%`);
  console.log(`📏 SL promedio: ${avgSlDistance.toFixed(3)}%`);
  console.log(`🎯 TP promedio: ${avgTpDistance.toFixed(3)}%`);
  
  // Casos donde el precio se acercó al SL pero no lo tocó
  const nearSL = expLosses.filter(s => {
    const slHit = s.side === 'LONG' ? s.exitPrice <= s.sl * 1.02 : s.exitPrice >= s.sl * 0.98;
    return slHit;
  });
  
  console.log(`\n🔍 Expiró cerca del SL: ${nearSL.length}/${expLosses.length}`);
  
  // Casos donde el precio se acercó al TP pero no lo tocó
  const nearTP = expLosses.filter(s => {
    const tpHit = s.side === 'LONG' ? s.exitPrice >= s.tp1 * 0.98 : s.exitPrice <= s.tp1 * 1.02;
    return tpHit;
  });
  
  console.log(`🔍 Expiró cerca del TP: ${nearTP.length}/${expLosses.length}`);
}

// Recomendaciones
console.log('\n=== RECOMENDACIONES PARA MEJORAR STOP LOSS ===');

// 1. Análisis de SL ajustados
if (lossPatterns.stopLoss.length > 0) {
  const tightSL = lossPatterns.stopLoss.filter(s => s.slDistancePct < 0.3);
  if (tightSL.length > 0) {
    console.log(`\n🔴 PROBLEMA: ${tightSL.length} SL muy ajustados (<0.3%)`);
    console.log(`   SOLUCIÓN: Aumentar SL mínimo a 0.4-0.5%`);
  }
}

// 2. Análisis de RR
if (lossPatterns.stopLoss.length > 0) {
  const badRR = lossPatterns.stopLoss.filter(s => s.rr < 1.0);
  if (badRR.length > 0) {
    console.log(`\n🔴 PROBLEMA: ${badRR.length} señales con RR < 1.0`);
    console.log(`   SOLUCIÓN: Aumentar RR mínimo a 1.2-1.5`);
  }
}

// 3. Análisis de expiraciones
if (lossPatterns.expiration.length > 0) {
  console.log(`\n🔴 PROBLEMA: ${lossPatterns.expiration.length} expiraciones (${(lossPatterns.expiration.length/lossPatterns.totalLosses*100).toFixed(1)}%)`);
  console.log(`   SOLUCIÓN: Implementar trailing stop o TP más conservadores`);
}

// 4. Análisis por volatilidad
if (lossPatterns.stopLoss.length > 0) {
  const highVol = lossPatterns.stopLoss.filter(s => s.volumeRatio > 1.5);
  if (highVol.length > 0) {
    console.log(`\n🔴 PROBLEMA: ${highVol.length} SL en alta volatilidad`);
    console.log(`   SOLUCIÓN: Aumentar SL en períodos de alta volatilidad`);
  }
}

console.log('\n=== RESUMEN DE MEJORAS SUGERIDAS ===');
console.log('1. 🎯 Aumentar SL mínimo a 0.4-0.5% del precio de entrada');
console.log('2. 📊 Aumentar RR mínimo a 1.2-1.5');
console.log('3. 🔄 Implementar trailing stop para evitar expiraciones');
console.log('4. 📈 Ajustar SL según volatilidad del mercado');
console.log('5. ⏰ Considerar TP más conservadores en mercados laterales');
