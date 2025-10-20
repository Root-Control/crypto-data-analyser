const fs = require('fs');

// Cargar las señales
const signalsData = JSON.parse(fs.readFileSync('trades/reports/signals-1760992627745.json', 'utf8'));
const signals = signalsData.signals;

console.log('=== ANÁLISIS DE RESULTADOS - 30,000 VELAS ===\n');

// Estadísticas generales
const totalSignals = signals.length;
let wins = 0;
let losses = 0;
let totalGrossUsd = 0;
let totalNetUsd = 0;
let totalFees = 0;

// Análisis por tipo de salida
const exitReasons = {
  'TP': 0,
  'SL': 0,
  'EXP': 0
};

// Análisis por lado
const sideStats = {
  'LONG': { total: 0, wins: 0, losses: 0, grossUsd: 0, netUsd: 0 },
  'SHORT': { total: 0, wins: 0, losses: 0, grossUsd: 0, netUsd: 0 }
};

// Análisis de pérdidas por razón
const lossReasons = {
  'SL': 0,
  'EXP': 0
};

console.log(`Total de señales: ${totalSignals}\n`);

// Procesar cada señal
signals.forEach((signal, idx) => {
  if (signal.realPnL) {
    const pnl = signal.realPnL;
    const isWin = pnl.netPct > 0;
    
    if (isWin) {
      wins++;
    } else {
      losses++;
      lossReasons[pnl.exitReason]++;
    }
    
    totalGrossUsd += pnl.grossUsd;
    totalNetUsd += pnl.netUsd;
    totalFees += pnl.totalFees;
    
    exitReasons[pnl.exitReason]++;
    
    // Estadísticas por lado
    sideStats[pnl.side].total++;
    if (isWin) {
      sideStats[pnl.side].wins++;
    } else {
      sideStats[pnl.side].losses++;
    }
    sideStats[pnl.side].grossUsd += pnl.grossUsd;
    sideStats[pnl.side].netUsd += pnl.netUsd;
  }
});

// Calcular porcentajes
const winRate = ((wins / totalSignals) * 100).toFixed(1);
const lossRate = ((losses / totalSignals) * 100).toFixed(1);
const totalROI = (totalNetUsd / (400 * totalSignals)) * 100;

console.log('=== RESULTADOS GENERALES ===');
console.log(`Ganadoras: ${wins} (${winRate}%)`);
console.log(`Perdedoras: ${losses} (${lossRate}%)`);
console.log(`ROI total: ${totalROI.toFixed(2)}%`);
console.log(`PnL bruto: $${totalGrossUsd.toFixed(2)}`);
console.log(`PnL neto: $${totalNetUsd.toFixed(2)}`);
console.log(`Fees totales: $${totalFees.toFixed(2)}`);
console.log('');

console.log('=== ANÁLISIS POR TIPO DE SALIDA ===');
console.log(`Take Profit (TP): ${exitReasons.TP} (${((exitReasons.TP/totalSignals)*100).toFixed(1)}%)`);
console.log(`Stop Loss (SL): ${exitReasons.SL} (${((exitReasons.SL/totalSignals)*100).toFixed(1)}%)`);
console.log(`Expiración (EXP): ${exitReasons.EXP} (${((exitReasons.EXP/totalSignals)*100).toFixed(1)}%)`);
console.log('');

console.log('=== ANÁLISIS DE PÉRDIDAS ===');
console.log(`Pérdidas por Stop Loss: ${lossReasons.SL} (${((lossReasons.SL/losses)*100).toFixed(1)}% de las pérdidas)`);
console.log(`Pérdidas por Expiración: ${lossReasons.EXP} (${((lossReasons.EXP/losses)*100).toFixed(1)}% de las pérdidas)`);
console.log('');

console.log('=== ANÁLISIS POR LADO ===');
console.log('LONG:');
console.log(`  Total: ${sideStats.LONG.total} señales`);
console.log(`  Ganadoras: ${sideStats.LONG.wins} (${((sideStats.LONG.wins/sideStats.LONG.total)*100).toFixed(1)}%)`);
console.log(`  Perdedoras: ${sideStats.LONG.losses} (${((sideStats.LONG.losses/sideStats.LONG.total)*100).toFixed(1)}%)`);
console.log(`  PnL neto: $${sideStats.LONG.netUsd.toFixed(2)}`);
console.log('');
console.log('SHORT:');
console.log(`  Total: ${sideStats.SHORT.total} señales`);
console.log(`  Ganadoras: ${sideStats.SHORT.wins} (${((sideStats.SHORT.wins/sideStats.SHORT.total)*100).toFixed(1)}%)`);
console.log(`  Perdedoras: ${sideStats.SHORT.losses} (${((sideStats.SHORT.losses/sideStats.SHORT.total)*100).toFixed(1)}%)`);
console.log(`  PnL neto: $${sideStats.SHORT.netUsd.toFixed(2)}`);
console.log('');

// Análisis de las primeras 10 señales para ver el patrón
console.log('=== PRIMERAS 10 SEÑALES (PATRÓN INICIAL) ===');
signals.slice(0, 10).forEach((signal, idx) => {
  if (signal.realPnL) {
    const pnl = signal.realPnL;
    const result = pnl.netPct > 0 ? 'GANÓ' : 'PERDIÓ';
    const color = pnl.netPct > 0 ? '🟢' : '🔴';
    console.log(`${idx + 1}. ${signal.side} - ${pnl.exitReason} - ${result} ${color} (${pnl.netPct.toFixed(2)}%)`);
  }
});

console.log('\n=== ANÁLISIS DE TENDENCIA ===');
if (lossReasons.SL > lossReasons.EXP) {
  console.log('🔴 PROBLEMA PRINCIPAL: Muchas señales alcanzan el Stop Loss');
  console.log('   - Posibles causas:');
  console.log('   - Stop Loss muy ajustado');
  console.log('   - Mercado muy volátil');
  console.log('   - Señales de baja calidad');
} else if (lossReasons.EXP > lossReasons.SL) {
  console.log('🟡 PROBLEMA PRINCIPAL: Muchas señales expiran sin alcanzar TP ni SL');
  console.log('   - Posibles causas:');
  console.log('   - Take Profit muy lejano');
  console.log('   - Mercado lateral');
  console.log('   - Señales de baja calidad');
} else {
  console.log('🟠 PROBLEMA MIXTO: Pérdidas distribuidas entre SL y EXP');
}

if (sideStats.LONG.netUsd < sideStats.SHORT.netUsd) {
  console.log('📈 LONG funciona mejor que SHORT');
} else if (sideStats.SHORT.netUsd < sideStats.LONG.netUsd) {
  console.log('📉 SHORT funciona mejor que LONG');
} else {
  console.log('⚖️ LONG y SHORT tienen rendimiento similar');
}
