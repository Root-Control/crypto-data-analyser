/**
 * Ejemplo de uso de la función runBasicSimulation exportada
 */

const { runBasicSimulation } = require('./testBasic');


const TP_MULTIPLIER = [1.0, 1.1, 1.2, 1.5, 2.0, 3.0];    
const TP_MAX_PERCENT = [0.005, 0.01, 0.015, 0.025, 0.05, 0.1]; 
const SL_PERCENT = [0.002, 0.005, 0.008, 0.01, 0.02, 0.05];     

for (let i = 0; i < TP_MULTIPLIER.length; i++) {
  for (let j = 0; j < TP_MAX_PERCENT.length; j++) {
    for (let k = 0; k < SL_PERCENT.length; k++) {
      const tpMultiplier = TP_MULTIPLIER[i];
      const tpMaxPercent = TP_MAX_PERCENT[j];
      const slPercent = SL_PERCENT[k];
      console.log(`[${i},${j},${k}]`);
      runBasicSimulation(false, { tpMultiplier, tpMaxPercent, slPercent });
    }
  }
}

