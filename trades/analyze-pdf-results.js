const fs = require('fs');
const path = require('path');

// Leer el archivo de señales más reciente
const signalsFile = 'trades/reports/signals-1761019495212.json';
const signals = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));

console.log('=== ANÁLISIS DEL PDF - MULTIPLICADOR 1.2 ===\n');

let totalSignals = signals.signals.length;
let wins = 0;
let losses = 0;
let totalGrossUsd = 0;
let totalNetUsd = 0;
let totalFees = 0;

// Análisis por tipo de salida
let exitReasons = {
  'TP1': 0,
  'TP2': 0,
  'SL': 0,
  'EXP': 0
};

// Análisis por lado
let longStats = { wins: 0, losses: 0, totalUsd: 0 };
let shortStats = { wins: 0, losses: 0, totalUsd: 0 };

console.log(`📊 TOTAL DE SEÑALES: ${totalSignals}\n`);

// Procesar cada señal
signals.signals.forEach((signal, idx) => {
  if (signal.realPnL) {
    const pnl = signal.realPnL;
    const isWin = pnl.netPct > 0;
    
    // Contar wins/losses
    if (isWin) {
      wins++;
    } else {
      losses++;
    }
    
    // Acumular totales
    totalGrossUsd += pnl.grossUsd;
    totalNetUsd += pnl.netUsd;
    totalFees += pnl.totalFees;
    
    // Contar razones de salida
    exitReasons[pnl.exitReason]++;
    
    // Estadísticas por lado
    if (signal.side === 'LONG') {
      longStats.totalUsd += pnl.netUsd;
      if (isWin) longStats.wins++;
      else longStats.losses++;
    } else {
      shortStats.totalUsd += pnl.netUsd;
      if (isWin) shortStats.wins++;
      else shortStats.losses++;
    }
    
    // Mostrar detalles de cada señal
    const date = new Date(signal.dtISO);
    const limaTime = date.toLocaleString('es-PE', {timeZone: 'America/Lima'});
    
    console.log(`Señal ${idx + 1}: ${signal.side} - ${limaTime}`);
    console.log(`  Entry: $${signal.entry} | Exit: $${pnl.exitPrice.toFixed(2)} (${pnl.exitReason})`);
    console.log(`  PnL: ${pnl.netPct.toFixed(2)}% ($${pnl.netUsd.toFixed(2)})`);
    console.log('');
  }
});

// Calcular métricas finales
const winRate = ((wins / totalSignals) * 100).toFixed(1);
const totalROI = (totalNetUsd / (400 * totalSignals)) * 100;

console.log('=== RESUMEN DE RESULTADOS ===');
console.log(`✅ GANADORAS: ${wins} (${winRate}%)`);
console.log(`❌ PERDEDORAS: ${losses} (${(100 - winRate).toFixed(1)}%)`);
console.log(`💰 PnL BRUTO TOTAL: $${totalGrossUsd.toFixed(2)}`);
console.log(`💸 PnL NETO TOTAL: $${totalNetUsd.toFixed(2)}`);
console.log(`📊 ROI TOTAL: ${totalROI.toFixed(2)}%`);
console.log(`💳 FEES TOTALES: $${totalFees.toFixed(2)}`);

console.log('\n=== ANÁLISIS POR RAZÓN DE SALIDA ===');
Object.entries(exitReasons).forEach(([reason, count]) => {
  const percentage = ((count / totalSignals) * 100).toFixed(1);
  console.log(`${reason}: ${count} (${percentage}%)`);
});

console.log('\n=== ANÁLISIS POR LADO ===');
if (longStats.wins + longStats.losses > 0) {
  const longWinRate = ((longStats.wins / (longStats.wins + longStats.losses)) * 100).toFixed(1);
  console.log(`LONG: ${longStats.wins}W/${longStats.losses}L (${longWinRate}%) - PnL: $${longStats.totalUsd.toFixed(2)}`);
}

if (shortStats.wins + shortStats.losses > 0) {
  const shortWinRate = ((shortStats.wins / (shortStats.wins + shortStats.losses)) * 100).toFixed(1);
  console.log(`SHORT: ${shortStats.wins}W/${shortStats.losses}L (${shortWinRate}%) - PnL: $${shortStats.totalUsd.toFixed(2)}`);
}

console.log('\n=== RECOMENDACIONES PARA MITIGAR PÉRDIDAS ===');
if (winRate < 50) {
  console.log('🔴 Win rate bajo - considerar:');
  console.log('  • Filtros de tendencia más estrictos');
  console.log('  • SL más amplios para evitar whipsaws');
  console.log('  • TP más conservadores');
}

if (exitReasons['EXP'] > exitReasons['TP1'] + exitReasons['TP2']) {
  console.log('🔴 Muchas expiraciones - considerar:');
  console.log('  • TP más conservadores');
  console.log('  • Mejor timing de entrada');
}

console.log('\n=== CONCLUSIÓN ===');
if (totalNetUsd > 0) {
  console.log('✅ Sistema rentable en este período');
} else {
  console.log('❌ Sistema con pérdidas - necesita optimización');
}
