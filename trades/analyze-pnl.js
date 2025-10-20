const signals = require('./reports/signals-1760991500760.json');

console.log('=== CÁLCULO DE PnL REAL (TAKER/TAKER) ===');
console.log('');

let totalGrossPct = 0;
let totalNetPct = 0;
let totalNetUsd = 0;
let totalCostUsd = 0;
let wins = 0;
let losses = 0;
let tpCount = 0;
let slCount = 0;
let expCount = 0;

console.log('DETALLE POR SEÑAL:');
console.log('==================');
console.log('');

signals.signals.forEach((signal, i) => {
  const date = new Date(signal.dtISO);
  const limaTime = date.toLocaleString('es-PE', {timeZone: 'America/Lima'});
  
  console.log(`Señal ${i+1}: ${signal.side} - ${limaTime}`);
  console.log(`Entrada: $${signal.entry}`);
  
  if (signal.realPnL) {
    const pnl = signal.realPnL;
    console.log(`Salida: $${pnl.exitPrice.toFixed(2)} (${pnl.exitReason})`);
    console.log(`PnL Bruto: ${pnl.grossPct.toFixed(2)}%`);
    console.log(`Costos: ${(pnl.costPct * 100).toFixed(2)}% (${pnl.totalCostBps} bps)`);
    console.log(`PnL Neto: ${pnl.netPct.toFixed(2)}% ($${pnl.netUsd.toFixed(2)})`);
    console.log(`ROI: ${pnl.roi.toFixed(2)}%`);
    
    // Acumular totales
    totalGrossPct += pnl.grossPct;
    totalNetPct += pnl.netPct;
    totalNetUsd += pnl.netUsd;
    totalCostUsd += pnl.costPct * pnl.capital;
    
    // Contar resultados
    if (pnl.netPct > 0) wins++;
    else if (pnl.netPct < 0) losses++;
    
    if (pnl.exitReason === 'TP') tpCount++;
    else if (pnl.exitReason === 'SL') slCount++;
    else if (pnl.exitReason === 'EXP') expCount++;
    
    console.log('');
  } else {
    console.log('❌ No hay PnL real calculado');
    console.log('');
  }
});

console.log('RESUMEN TOTAL:');
console.log('==============');
console.log(`Total de señales: ${signals.signals.length}`);
console.log(`Ganancias: ${wins} (${((wins/signals.signals.length)*100).toFixed(1)}%)`);
console.log(`Pérdidas: ${losses} (${((losses/signals.signals.length)*100).toFixed(1)}%)`);
console.log('');
console.log(`TP alcanzados: ${tpCount}`);
console.log(`SL alcanzados: ${slCount}`);
console.log(`EXP (sin salida): ${expCount}`);
console.log('');
console.log(`PnL Bruto Total: ${totalGrossPct.toFixed(2)}%`);
console.log(`Costos Total: $${totalCostUsd.toFixed(2)} USD`);
console.log(`PnL Neto Total: ${totalNetPct.toFixed(2)}% ($${totalNetUsd.toFixed(2)})`);
console.log(`ROI Promedio: ${(totalNetPct/signals.signals.length).toFixed(2)}%`);
console.log('');
console.log(`Capital inicial: $${400 * signals.signals.length}`);
console.log(`Capital final: $${(400 * signals.signals.length) + totalNetUsd}`);
console.log(`Ganancia/Pérdida total: $${totalNetUsd.toFixed(2)}`);
