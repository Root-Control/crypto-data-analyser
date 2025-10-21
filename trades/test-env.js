require('dotenv').config();
console.log('=== VERIFICACIÓN DE VARIABLES DE ENTORNO ===');
console.log('TP_MULTIPLIER:', process.env.TP_MULTIPLIER);
console.log('parseFloat(process.env.TP_MULTIPLIER):', parseFloat(process.env.TP_MULTIPLIER));
console.log('parseFloat(process.env.TP_MULTIPLIER) || 1.0:', parseFloat(process.env.TP_MULTIPLIER) || 1.0);

console.log('\n=== TODAS LAS VARIABLES DE ENTORNO ===');
Object.keys(process.env)
  .filter(key => key.includes('TP') || key.includes('MULTIPLIER'))
  .forEach(key => console.log(`${key}: ${process.env[key]}`));
