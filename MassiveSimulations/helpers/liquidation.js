/**
 * Helper para calcular precios de liquidación en trading con apalancamiento
 * Basado en las fórmulas estándar de Binance Futures y otros exchanges
 */

/**
 * Calcula el precio de liquidación para una posición LARGA (Long)
 * 
 * Fórmula: Liquidation Price = Entry Price * (1 - Initial Margin Rate + Maintenance Margin Rate + Fees)
 * 
 * @param {number} entryPrice - Precio de entrada de la posición
 * @param {number} leverage - Apalancamiento utilizado (ej: 10 para 10x)
 * @param {number} maintenanceMarginRate - Tasa de margen de mantenimiento (ej: 0.004 para 0.4%)
 * @param {number} fees - Tasa de fees totales (entrada + salida) (ej: 0.001 para 0.1%)
 * @returns {number} Precio de liquidación para posición larga
 */
function calculateLongLiquidationPrice(entryPrice, leverage, maintenanceMarginRate = 0.005, fees = 0.0006) {
  const initialMarginRate = 1 / leverage;
  const liquidationPrice = entryPrice * (1 - initialMarginRate + maintenanceMarginRate + fees);
  return liquidationPrice;
}

/**
 * Calcula el precio de liquidación para una posición CORTA (Short)
 * 
 * Fórmula: Liquidation Price = Entry Price * (1 + Initial Margin Rate - Maintenance Margin Rate + Fees)
 * 
 * @param {number} entryPrice - Precio de entrada de la posición
 * @param {number} leverage - Apalancamiento utilizado (ej: 10 para 10x)
 * @param {number} maintenanceMarginRate - Tasa de margen de mantenimiento (ej: 0.004 para 0.4%)
 * @param {number} fees - Tasa de fees totales (entrada + salida) (ej: 0.001 para 0.1%)
 * @returns {number} Precio de liquidación para posición corta
 */
function calculateShortLiquidationPrice(entryPrice, leverage, maintenanceMarginRate = 0.005, fees = 0.0006) {
  const initialMarginRate = 1 / leverage;
  const liquidationPrice = entryPrice * (1 + initialMarginRate - maintenanceMarginRate + fees);
  return liquidationPrice;
}

/**
 * Calcula el precio de liquidación para cualquier tipo de posición
 * 
 * @param {string} side - 'LONG' o 'SHORT'
 * @param {number} entryPrice - Precio de entrada de la posición
 * @param {number} leverage - Apalancamiento utilizado
 * @param {number} maintenanceMarginRate - Tasa de margen de mantenimiento
 * @param {number} fees - Tasa de fees totales (entrada + salida)
 * @returns {number} Precio de liquidación
 */
function calculateLiquidationPrice(side, entryPrice, leverage, maintenanceMarginRate = 0.005, fees = 0.0006) {
  if (side.toUpperCase() === 'LONG') {
    return calculateLongLiquidationPrice(entryPrice, leverage, maintenanceMarginRate, fees);
  } else if (side.toUpperCase() === 'SHORT') {
    return calculateShortLiquidationPrice(entryPrice, leverage, maintenanceMarginRate, fees);
  } else {
    throw new Error('Side must be "LONG" or "SHORT"');
  }
}

/**
 * Calcula el margen inicial requerido para una posición
 * 
 * @param {number} notionalValue - Valor nocional de la posición (entryPrice * positionSize)
 * @param {number} leverage - Apalancamiento utilizado
 * @returns {number} Margen inicial requerido
 */
function calculateInitialMargin(notionalValue, leverage) {
  return notionalValue / leverage;
}

/**
 * Calcula el margen de mantenimiento requerido para una posición
 * 
 * @param {number} notionalValue - Valor nocional de la posición
 * @param {number} maintenanceMarginRate - Tasa de margen de mantenimiento
 * @returns {number} Margen de mantenimiento requerido
 */
function calculateMaintenanceMargin(notionalValue, maintenanceMarginRate = 0.004) {
  return notionalValue * maintenanceMarginRate;
}

/**
 * Calcula el ratio de margen actual de una posición
 * 
 * @param {number} currentPrice - Precio actual del activo
 * @param {number} entryPrice - Precio de entrada de la posición
 * @param {string} side - 'LONG' o 'SHORT'
 * @param {number} leverage - Apalancamiento utilizado
 * @param {number} maintenanceMarginRate - Tasa de margen de mantenimiento
 * @returns {number} Ratio de margen actual (1.0 = 100%)
 */
function calculateMarginRatio(currentPrice, entryPrice, side, leverage, maintenanceMarginRate = 0.004) {
  const notionalValue = entryPrice; // Asumiendo positionSize = 1 para simplificar
  const initialMargin = calculateInitialMargin(notionalValue, leverage);
  const maintenanceMargin = calculateMaintenanceMargin(notionalValue, maintenanceMarginRate);
  
  let unrealizedPnL;
  if (side.toUpperCase() === 'LONG') {
    unrealizedPnL = (currentPrice - entryPrice) / entryPrice;
  } else {
    unrealizedPnL = (entryPrice - currentPrice) / entryPrice;
  }
  
  const currentMargin = initialMargin + (unrealizedPnL * notionalValue);
  return currentMargin / maintenanceMargin;
}

/**
 * Verifica si una posición está en riesgo de liquidación
 * 
 * @param {number} currentPrice - Precio actual del activo
 * @param {number} entryPrice - Precio de entrada de la posición
 * @param {string} side - 'LONG' o 'SHORT'
 * @param {number} leverage - Apalancamiento utilizado
 * @param {number} maintenanceMarginRate - Tasa de margen de mantenimiento
 * @param {number} warningThreshold - Umbral de advertencia (ej: 1.5 = 150%)
 * @param {number} fees - Tasa de fees totales (entrada + salida)
 * @returns {object} Estado de la posición
 */
function checkLiquidationRisk(currentPrice, entryPrice, side, leverage, maintenanceMarginRate = 0.005, warningThreshold = 1.5, fees = 0.0006) {
  const marginRatio = calculateMarginRatio(currentPrice, entryPrice, side, leverage, maintenanceMarginRate);
  const liquidationPrice = calculateLiquidationPrice(side, entryPrice, leverage, maintenanceMarginRate, fees);
  
  let status = 'SAFE';
  if (marginRatio <= 1.0) {
    status = 'LIQUIDATED';
  } else if (marginRatio <= warningThreshold) {
    status = 'WARNING';
  }
  
  return {
    status,
    marginRatio,
    liquidationPrice,
    isAtRisk: marginRatio <= warningThreshold,
    isLiquidated: marginRatio <= 1.0
  };
}

/**
 * Calcula el precio de liquidación usando la fórmula alternativa basada en PnL
 * 
 * @param {number} entryPrice - Precio de entrada
 * @param {number} positionSize - Tamaño de la posición
 * @param {number} initialMargin - Margen inicial utilizado
 * @param {string} side - 'LONG' o 'SHORT'
 * @returns {number} Precio de liquidación
 */
function calculateLiquidationPriceByPnL(entryPrice, positionSize, initialMargin, side) {
  if (side.toUpperCase() === 'LONG') {
    return entryPrice - (initialMargin / positionSize);
  } else {
    return entryPrice + (initialMargin / positionSize);
  }
}

module.exports = {
  calculateLongLiquidationPrice,
  calculateShortLiquidationPrice,
  calculateLiquidationPrice,
  calculateInitialMargin,
  calculateMaintenanceMargin,
  calculateMarginRatio,
  checkLiquidationRisk,
  calculateLiquidationPriceByPnL
};
