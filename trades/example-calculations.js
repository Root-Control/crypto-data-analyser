const signals = require('./reports/signals-1760991901596.json');

console.log('=== EJEMPLO DE CÁLCULOS CON $400 APALANCADO A 20X ===');
console.log('');

const signal = signals.signals[1]; // Señal 2 como ejemplo
if (signal.realPnL) {
  const pnl = signal.realPnL;
  console.log('Señal 2 (SHORT):');
  console.log(`Entrada: $${signal.entry}`);
  console.log(`Salida: $${pnl.exitPrice} (${pnl.exitReason})`);
  console.log('');
  console.log('CÁLCULOS:');
  console.log(`Capital: $${pnl.capital}`);
  console.log(`Apalancamiento: ${pnl.leverage}x`);
  console.log(`Fees totales: ${pnl.totalCostBps} bps (${(pnl.costPct * 100).toFixed(2)}%)`);
  console.log('');
  console.log('PnL BRUTO:');
  console.log(`Porcentaje: ${pnl.grossPct.toFixed(2)}%`);
  console.log(`USD: $${pnl.grossUsd.toFixed(2)}`);
  console.log('');
  console.log('PnL NETO (después de fees):');
  console.log(`Porcentaje: ${pnl.netPct.toFixed(2)}%`);
  console.log(`USD: $${pnl.netUsd.toFixed(2)}`);
  console.log('');
  console.log('DIFERENCIA:');
  console.log(`Fees en USD: $${(pnl.grossUsd - pnl.netUsd).toFixed(2)}`);
}
