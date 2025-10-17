/**
 * Ejemplo de uso de la función runBasicSimulation exportada
 */

const { runBasicSimulation } = require('./testBasic');

// Ejecutar con logs detallados
console.log('=== EJECUTANDO CON LOGS DETALLADOS ===');
runBasicSimulation(true);

// Esperar un poco y ejecutar con logs simples
setTimeout(() => {
  console.log('\n=== EJECUTANDO CON LOGS SIMPLES ===');
  runBasicSimulation(false);
}, 2000);
