/**
 * Script para analizar los resultados de Three White Soldiers
 * Extrae datos de liquidaciones, max fall vs max rise, y última vela
 */

const fs = require('fs');
const path = require('path');

// Función para calcular liquidación
function calculateLiquidation(entryPrice, leverage) {
  const maintenanceMarginRate = 0.005; // 0.5%
  const fees = 0.0006; // 0.06%
  const liquidationPrice = entryPrice * (1 - 1/leverage + maintenanceMarginRate + fees);
  return liquidationPrice;
}

// Función para simular análisis de patrones (datos de ejemplo basados en el backtest)
function analyzeThreeWhiteSoldiers() {
  console.log('=== ANÁLISIS DETALLADO DE THREE WHITE SOLDIERS ===');
  console.log('Basado en 16 detecciones encontradas en 5,000 velas (últimas 2 meses)');
  console.log('15 detecciones finales después de filtrar duplicados temporales');
  console.log('Frecuencia: ~8 patrones por mes');
  console.log('');
  console.log('⚠️  NOTA: Los datos de rendimiento son SIMULADOS');
  console.log('Para obtener datos reales, necesitamos extraer la información del PDF generado');
  console.log('o modificar el código del backtest para guardar los datos en JSON');
  console.log('');

  // DATOS SIMULADOS - NO REALES
  const detections = [
    { entryPrice: 4000, maxRise: 8.5, maxFall: -2.1, lastCandle: 3.2 },
    { entryPrice: 4200, maxRise: 12.3, maxFall: -1.8, lastCandle: 9.1 },
    { entryPrice: 3800, maxRise: 6.7, maxFall: -3.2, lastCandle: 2.4 },
    { entryPrice: 4100, maxRise: 15.2, maxFall: -0.9, lastCandle: 11.8 },
    { entryPrice: 3950, maxRise: 4.3, maxFall: -4.1, lastCandle: -1.2 },
    { entryPrice: 4300, maxRise: 18.7, maxFall: -1.5, lastCandle: 14.3 },
    { entryPrice: 3700, maxRise: 7.9, maxFall: -2.8, lastCandle: 4.6 },
    { entryPrice: 4400, maxRise: 22.1, maxFall: -0.7, lastCandle: 18.9 },
    { entryPrice: 3600, maxRise: 5.4, maxFall: -5.2, lastCandle: -2.1 },
    { entryPrice: 4500, maxRise: 25.6, maxFall: -1.1, lastCandle: 21.4 },
    { entryPrice: 3900, maxRise: 9.8, maxFall: -3.5, lastCandle: 6.2 },
    { entryPrice: 4600, maxRise: 28.3, maxFall: -0.8, lastCandle: 24.7 },
    { entryPrice: 3750, maxRise: 6.1, maxFall: -4.3, lastCandle: 1.8 },
    { entryPrice: 4700, maxRise: 31.2, maxFall: -0.6, lastCandle: 27.5 },
    { entryPrice: 3850, maxRise: 8.7, maxFall: -2.9, lastCandle: 5.3 }
  ];

  console.log('=== 1. ANÁLISIS DE LIQUIDACIONES ===');
  console.log('');
  
  const entryPrices = [4000, 400, 100];
  const leverage = 100;
  
  console.log('Liquidaciones con 100X leverage:');
  entryPrices.forEach(price => {
    const liquidationPrice = calculateLiquidation(price, leverage);
    const liquidationPercent = ((liquidationPrice - price) / price) * 100;
    console.log(`Precio entrada $${price}: Liq $${liquidationPrice.toFixed(2)} (${liquidationPercent.toFixed(1)}%)`);
  });
  
  console.log('');
  console.log('=== 2. ANÁLISIS MAX FALL vs MAX RISE ===');
  console.log('');
  
  // Calcular estadísticas
  const maxRises = detections.map(d => d.maxRise);
  const maxFalls = detections.map(d => Math.abs(d.maxFall));
  const lastCandles = detections.map(d => d.lastCandle);
  
  const avgMaxRise = maxRises.reduce((a, b) => a + b, 0) / maxRises.length;
  const avgMaxFall = maxFalls.reduce((a, b) => a + b, 0) / maxFalls.length;
  const avgLastCandle = lastCandles.reduce((a, b) => a + b, 0) / lastCandles.length;
  
  const maxRiseValue = Math.max(...maxRises);
  const maxFallValue = Math.max(...maxFalls);
  const minRiseValue = Math.min(...maxRises);
  const minFallValue = Math.min(...maxFalls);
  
  console.log('Estadísticas de rendimiento en las siguientes 5 velas:');
  console.log(`Promedio Max Rise: ${avgMaxRise.toFixed(2)}%`);
  console.log(`Promedio Max Fall: ${avgMaxFall.toFixed(2)}%`);
  console.log(`Promedio Última Vela: ${avgLastCandle.toFixed(2)}%`);
  console.log('');
  console.log('Rangos:');
  console.log(`Max Rise: ${minRiseValue.toFixed(2)}% - ${maxRiseValue.toFixed(2)}%`);
  console.log(`Max Fall: ${minFallValue.toFixed(2)}% - ${maxFallValue.toFixed(2)}%`);
  console.log('');
  
  // Análisis de riesgo
  const positiveLastCandles = lastCandles.filter(c => c > 0).length;
  const negativeLastCandles = lastCandles.filter(c => c < 0).length;
  const neutralLastCandles = lastCandles.filter(c => c === 0).length;
  
  console.log('=== 3. ANÁLISIS DE LA ÚLTIMA VELA ===');
  console.log('');
  console.log(`Velas positivas en la 5ta vela: ${positiveLastCandles}/${detections.length} (${(positiveLastCandles/detections.length*100).toFixed(1)}%)`);
  console.log(`Velas negativas en la 5ta vela: ${negativeLastCandles}/${detections.length} (${(negativeLastCandles/detections.length*100).toFixed(1)}%)`);
  console.log(`Velas neutrales en la 5ta vela: ${neutralLastCandles}/${detections.length} (${(neutralLastCandles/detections.length*100).toFixed(1)}%)`);
  console.log('');
  
  // Recomendaciones de TP y SL
  console.log('=== 4. RECOMENDACIONES DE TP Y SL ===');
  console.log('');
  
  // Calcular percentiles para recomendaciones más seguras
  const sortedRises = maxRises.sort((a, b) => a - b);
  const sortedFalls = maxFalls.sort((a, b) => a - b);
  
  const p25Rise = sortedRises[Math.floor(sortedRises.length * 0.25)];
  const p75Rise = sortedRises[Math.floor(sortedRises.length * 0.75)];
  const p25Fall = sortedFalls[Math.floor(sortedFalls.length * 0.25)];
  const p75Fall = sortedFalls[Math.floor(sortedFalls.length * 0.75)];
  
  console.log('Análisis de percentiles:');
  console.log(`25% de los casos: Rise > ${p25Rise.toFixed(2)}%, Fall < ${p25Fall.toFixed(2)}%`);
  console.log(`75% de los casos: Rise > ${p75Rise.toFixed(2)}%, Fall < ${p75Fall.toFixed(2)}%`);
  console.log('');
  
  // Recomendaciones conservadoras
  const conservativeTP = Math.min(p25Rise, avgMaxRise * 0.7);
  const conservativeSL = Math.max(p25Fall, avgMaxFall * 1.2);
  
  console.log('RECOMENDACIONES CONSERVADORAS:');
  console.log(`Take Profit: ${conservativeTP.toFixed(1)}% (75% de probabilidad de éxito)`);
  console.log(`Stop Loss: ${conservativeSL.toFixed(1)}% (protege contra 75% de las caídas)`);
  console.log('');
  
  // Recomendaciones moderadas
  const moderateTP = avgMaxRise * 0.8;
  const moderateSL = avgMaxFall * 1.1;
  
  console.log('RECOMENDACIONES MODERADAS:');
  console.log(`Take Profit: ${moderateTP.toFixed(1)}% (basado en promedio)`);
  console.log(`Stop Loss: ${moderateSL.toFixed(1)}% (basado en promedio)`);
  console.log('');
  
  // Análisis de liquidación
  console.log('=== 5. ANÁLISIS DE RIESGO DE LIQUIDACIÓN ===');
  console.log('');
  
  const liquidationRisk = detections.filter(d => {
    const liquidationPrice = calculateLiquidation(d.entryPrice, 100);
    const maxFallPrice = d.entryPrice * (1 + d.maxFall/100);
    return maxFallPrice <= liquidationPrice;
  }).length;
  
  console.log(`Casos que se liquidarían con 100X: ${liquidationRisk}/${detections.length} (${(liquidationRisk/detections.length*100).toFixed(1)}%)`);
  console.log('');
  
  if (liquidationRisk > 0) {
    console.log('⚠️  ADVERTENCIA: Algunos casos se liquidarían con 100X leverage');
    console.log('Recomendación: Usar leverage más bajo (50X o menos) para mayor seguridad');
  } else {
    console.log('✅ Todos los casos sobrevivieron con 100X leverage');
  }
  
  console.log('');
  console.log('=== 6. DETALLES POR DETECCIÓN ===');
  console.log('');
  detections.forEach((detection, index) => {
    const liquidationPrice = calculateLiquidation(detection.entryPrice, 100);
    const maxFallPrice = detection.entryPrice * (1 + detection.maxFall/100);
    const wouldLiquidate = maxFallPrice <= liquidationPrice;
    
    console.log(`Detección ${index + 1}:`);
    console.log(`  Precio entrada: $${detection.entryPrice}`);
    console.log(`  Max Rise: ${detection.maxRise.toFixed(1)}%`);
    console.log(`  Max Fall: ${detection.maxFall.toFixed(1)}%`);
    console.log(`  Última vela: ${detection.lastCandle.toFixed(1)}%`);
    console.log(`  Liquidación 100X: $${liquidationPrice.toFixed(2)}`);
    console.log(`  ¿Se liquidaría?: ${wouldLiquidate ? 'SÍ' : 'NO'}`);
    console.log('');
  });
}

// Ejecutar análisis
analyzeThreeWhiteSoldiers();
