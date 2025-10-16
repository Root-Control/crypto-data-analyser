/**
 * Ejemplo de uso del helper de liquidación
 */

const {
  calculateLongLiquidationPrice,
  calculateShortLiquidationPrice,
  calculateLiquidationPrice,
  calculateInitialMargin,
  calculateMaintenanceMargin,
  calculateMarginRatio,
  checkLiquidationRisk
} = require('./liquidation');

// Ejemplo 1: Posición LARGA con apalancamiento 10x
console.log('=== EJEMPLO 1: POSICIÓN LARGA ===');
const entryPrice = 4000; // ETH a $4000
const leverage = 10; // 10x apalancamiento
const maintenanceMarginRate = 0.004; // 0.4% margen de mantenimiento

const longLiquidationPrice = calculateLongLiquidationPrice(entryPrice, leverage, maintenanceMarginRate);
console.log(`Precio de entrada: $${entryPrice}`);
console.log(`Apalancamiento: ${leverage}x`);
console.log(`Precio de liquidación (LONG): $${longLiquidationPrice.toFixed(2)}`);
console.log(`Distancia hasta liquidación: ${(((entryPrice - longLiquidationPrice) / entryPrice) * 100).toFixed(2)}%`);

// Ejemplo 2: Posición CORTA con apalancamiento 5x
console.log('\n=== EJEMPLO 2: POSICIÓN CORTA ===');
const shortLiquidationPrice = calculateShortLiquidationPrice(entryPrice, 5, maintenanceMarginRate);
console.log(`Precio de entrada: $${entryPrice}`);
console.log(`Apalancamiento: 5x`);
console.log(`Precio de liquidación (SHORT): $${shortLiquidationPrice.toFixed(2)}`);
console.log(`Distancia hasta liquidación: ${(((shortLiquidationPrice - entryPrice) / entryPrice) * 100).toFixed(2)}%`);

// Ejemplo 3: Cálculo de márgenes
console.log('\n=== EJEMPLO 3: CÁLCULO DE MÁRGENES ===');
const notionalValue = 4000; // $4000 de valor nocional
const initialMargin = calculateInitialMargin(notionalValue, leverage);
const maintenanceMargin = calculateMaintenanceMargin(notionalValue, maintenanceMarginRate);

console.log(`Valor nocional: $${notionalValue}`);
console.log(`Margen inicial requerido: $${initialMargin.toFixed(2)}`);
console.log(`Margen de mantenimiento: $${maintenanceMargin.toFixed(2)}`);

// Ejemplo 4: Verificación de riesgo de liquidación
console.log('\n=== EJEMPLO 4: VERIFICACIÓN DE RIESGO ===');
const currentPrice = 3950; // Precio actual
const riskCheck = checkLiquidationRisk(currentPrice, entryPrice, 'LONG', leverage, maintenanceMarginRate);

console.log(`Precio actual: $${currentPrice}`);
console.log(`Estado: ${riskCheck.status}`);
console.log(`Ratio de margen: ${(riskCheck.marginRatio * 100).toFixed(2)}%`);
console.log(`¿En riesgo?: ${riskCheck.isAtRisk ? 'SÍ' : 'NO'}`);
console.log(`¿Liquidado?: ${riskCheck.isLiquidated ? 'SÍ' : 'NO'}`);

// Ejemplo 5: Simulación con diferentes precios
console.log('\n=== EJEMPLO 5: SIMULACIÓN DE PRECIOS ===');
const prices = [4100, 4050, 4000, 3950, 3900, 3850, 3800];

console.log('Precio | Ratio Margen | Estado');
console.log('-------|--------------|--------');
prices.forEach(price => {
  const risk = checkLiquidationRisk(price, entryPrice, 'LONG', leverage, maintenanceMarginRate);
  console.log(`$${price} | ${(risk.marginRatio * 100).toFixed(1)}% | ${risk.status}`);
});
