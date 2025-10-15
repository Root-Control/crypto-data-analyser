#!/usr/bin/env node

const https = require('https');

// Configuración
const BINANCE_API_BASE = 'https://fapi.binance.com';
const SYMBOL = 'ETHUSDT';
const INTERVAL = '15m';
const DEFAULT_LIMIT = 200;
const MIN_STABLE_LIMIT = 1000;
const MAX_STABLE_LIMIT = 2000;

class ETHUSDTAnalyzer {
  constructor() {
    this.candles = [];
    this.dataQuality = {
      reliable: true,
      warnings: [],
      gaps: 0,
      outliers: []
    };
  }

  /**
   * Descarga klines de Binance Futures
   */
  async fetchKlines(limit = DEFAULT_LIMIT, endTime = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${BINANCE_API_BASE}/fapi/v1/klines`);
      url.searchParams.set('symbol', SYMBOL);
      url.searchParams.set('interval', INTERVAL);
      url.searchParams.set('limit', Math.min(limit, 1500)); // Binance max por request
      
      if (endTime) {
        url.searchParams.set('endTime', new Date(endTime).getTime());
      }

      console.log(`📊 Descargando ${limit} velas de ${SYMBOL} (${INTERVAL})...`);
      console.log(`🔗 URL: ${url.toString()}`);

      https.get(url.toString(), (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const klines = JSON.parse(data);
            console.log(`✅ Obtenidas ${klines.length} velas`);
            resolve(klines);
          } catch (error) {
            reject(new Error(`Error parsing response: ${error.message}`));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });
    });
  }

  /**
   * Valida y limpia los datos de klines
   */
  validateAndCleanData(rawKlines) {
    console.log('🔍 Validando calidad de datos...');
    
    // Convertir a formato estándar
    const candles = rawKlines.map(kline => ({
      openTime: parseInt(kline[0]),
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: parseInt(kline[6]),
      quoteVolume: parseFloat(kline[7]),
      trades: parseInt(kline[8]),
      takerBuyBaseVolume: parseFloat(kline[9]),
      takerBuyQuoteVolume: parseFloat(kline[10])
    }));

    // Ordenar por openTime (ascendente)
    candles.sort((a, b) => a.openTime - b.openTime);

    // Verificar intervalos de 15 minutos
    let gaps = 0;
    for (let i = 1; i < candles.length; i++) {
      const expectedTime = candles[i-1].openTime + (15 * 60 * 1000);
      const actualTime = candles[i].openTime;
      const diff = Math.abs(actualTime - expectedTime);
      
      if (diff > 60000) { // Más de 1 minuto de diferencia
        gaps++;
        console.log(`⚠️ Gap detectado: ${new Date(candles[i-1].openTime).toISOString()} -> ${new Date(actualTime).toISOString()}`);
      }
    }

    // Excluir última vela si no ha cerrado (menos de 90 segundos para cierre)
    const now = Date.now();
    const lastCandle = candles[candles.length - 1];
    const timeToClose = lastCandle.closeTime - now;
    
    if (timeToClose > 90000) { // Más de 90 segundos para cierre
      console.log('⚠️ Excluyendo última vela (no ha cerrado)');
      candles.pop();
    }

    // Actualizar calidad de datos
    this.dataQuality.gaps = gaps;
    if (gaps > 1) {
      this.dataQuality.reliable = false;
      this.dataQuality.warnings.push(`Gaps detectados: ${gaps}`);
    }

    if (candles.length < 500) {
      this.dataQuality.warnings.push(`Pocas velas: ${candles.length} (recomendado: ≥1000)`);
    }

    console.log(`✅ Datos validados: ${candles.length} velas, ${gaps} gaps`);
    return candles;
  }

  /**
   * Calcula métricas técnicas
   */
  calculateMetrics(candles) {
    const metrics = {
      ema20: this.calculateEMA(candles.map(c => c.close), 20),
      ema50: this.calculateEMA(candles.map(c => c.close), 50),
      atr10: this.calculateATR(candles, 10),
      sma20Volume: this.calculateSMA(candles.map(c => c.volume), 20),
      bodyAvg10: this.calculateBodyAvg(candles, 10)
    };

    // Pendiente EMA20 (últimos 3 períodos)
    const ema20Slope = candles.length >= 3 ? 
      (metrics.ema20[metrics.ema20.length - 1] - metrics.ema20[metrics.ema20.length - 4]) / 3 : 0;

    metrics.ema20Slope = ema20Slope;

    return metrics;
  }

  /**
   * Calcula EMA
   */
  calculateEMA(prices, period) {
    const ema = [];
    const multiplier = 2 / (period + 1);
    
    // Primera EMA es SMA
    let sum = 0;
    for (let i = 0; i < period && i < prices.length; i++) {
      sum += prices[i];
    }
    ema[period - 1] = sum / period;
    
    // Calcular EMA restante
    for (let i = period; i < prices.length; i++) {
      ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
    }
    
    return ema;
  }

  /**
   * Calcula ATR
   */
  calculateATR(candles, period) {
    const tr = [];
    
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      tr[i] = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
    }
    
    return this.calculateSMA(tr.slice(1), period);
  }

  /**
   * Calcula SMA
   */
  calculateSMA(prices, period) {
    const sma = [];
    
    for (let i = period - 1; i < prices.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += prices[i - j];
      }
      sma[i] = sum / period;
    }
    
    return sma;
  }

  /**
   * Calcula promedio de body de velas
   */
  calculateBodyAvg(candles, period) {
    const bodies = candles.map(c => Math.abs(c.close - c.open));
    return this.calculateSMA(bodies, period);
  }

  /**
   * Evalúa reglas bajistas
   */
  evaluateBearishRules(candles, metrics) {
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const prev2Candle = candles[candles.length - 3];
    
    const rules = {
      R1: false, // Rechazo arriba
      R2: false, // Engulfing rojo grande
      R3: false, // Precio vs medias + pendiente
      R4: false, // Estructura decreciente
      R5: false, // Volumen vendedor anómalo
      R6: false  // Test fallido de EMA20
    };

    const reasons = [];
    const metrics_values = {};

    // R1: Rechazo arriba
    const range = lastCandle.high - lastCandle.low;
    const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    const closePctInRange = (lastCandle.close - lastCandle.low) / range;
    
    if (upperWick >= 0.5 * range && closePctInRange <= 0.40) {
      rules.R1 = true;
      reasons.push(`R1: Rechazo arriba (wick: ${(upperWick/range*100).toFixed(1)}%, close: ${(closePctInRange*100).toFixed(1)}%)`);
    }
    metrics_values.upperWickPct = (upperWick/range*100).toFixed(1);
    metrics_values.closePctInRange = (closePctInRange*100).toFixed(1);

    // R2: Engulfing rojo grande
    const bodySize = Math.abs(lastCandle.close - lastCandle.open);
    const bodyAvg = metrics.bodyAvg10[metrics.bodyAvg10.length - 1];
    
    if (lastCandle.close < lastCandle.open && bodySize >= 1.2 * bodyAvg) {
      rules.R2 = true;
      reasons.push(`R2: Engulfing rojo grande (body: ${(bodySize/bodyAvg).toFixed(2)}x avg)`);
    }
    metrics_values.bodySize = bodySize.toFixed(2);
    metrics_values.bodyAvg = bodyAvg.toFixed(2);

    // R3: Precio vs medias + pendiente
    const currentEma20 = metrics.ema20[metrics.ema20.length - 1];
    const currentEma50 = metrics.ema50[metrics.ema50.length - 1];
    const ema20Slope = metrics.ema20Slope;
    
    if (lastCandle.close < currentEma20 && ema20Slope < 0) {
      rules.R3 = true;
      let confluencia = 0;
      if (lastCandle.close < currentEma50) confluencia += 0.5;
      if (currentEma20 < currentEma50) confluencia += 0.5;
      
      reasons.push(`R3: Precio vs medias + pendiente (close: $${lastCandle.close.toFixed(2)}, EMA20: $${currentEma20.toFixed(2)}, slope: ${ema20Slope.toFixed(4)})${confluencia > 0 ? ` + confluencia: ${confluencia}` : ''}`);
    }
    metrics_values.close = lastCandle.close.toFixed(2);
    metrics_values.ema20 = currentEma20.toFixed(2);
    metrics_values.ema50 = currentEma50.toFixed(2);
    metrics_values.ema20Slope = ema20Slope.toFixed(4);

    // R4: Estructura decreciente (5 velas)
    if (candles.length >= 5) {
      const high1 = lastCandle.high;
      const low1 = lastCandle.low;
      const high3 = candles[candles.length - 4].high;
      const low3 = candles[candles.length - 4].low;
      
      if ((high1 < high3 && low1 < low3)) {
        rules.R4 = true;
        reasons.push(`R4: Estructura decreciente (high: ${high1.toFixed(2)} < ${high3.toFixed(2)}, low: ${low1.toFixed(2)} < ${low3.toFixed(2)})`);
      }
    }

    // R5: Volumen vendedor anómalo
    const currentVolume = lastCandle.volume;
    const sma20Vol = metrics.sma20Volume[metrics.sma20Volume.length - 1];
    const volumeRatio = currentVolume / sma20Vol;
    
    if (volumeRatio >= 1.5 && closePctInRange <= 0.33) {
      rules.R5 = true;
      reasons.push(`R5: Volumen vendedor anómalo (vol: ${volumeRatio.toFixed(2)}x, close: ${(closePctInRange*100).toFixed(1)}%)`);
    }
    metrics_values.volumeRatio = volumeRatio.toFixed(2);

    // R6: Test fallido de EMA20
    if (prevCandle && prev2Candle) {
      const prevTouchedEma20 = (prevCandle.low <= currentEma20 && prevCandle.high >= currentEma20);
      const prevClosedBelowEma20 = prevCandle.close <= currentEma20;
      const currentLowerHigh = lastCandle.high < prevCandle.high;
      
      if (prevTouchedEma20 && prevClosedBelowEma20 && currentLowerHigh) {
        rules.R6 = true;
        reasons.push(`R6: Test fallido de EMA20 (prev touched EMA20, closed below, current lower high)`);
      }
    }

    // Calcular hits y confluencia
    const hits = Object.values(rules).filter(Boolean).length;
    const confluencia = (lastCandle.close < currentEma50 || currentEma20 < currentEma50) ? 0.5 : 0;
    const totalHits = hits + confluencia;

    // Determinar strength y bias
    let strength = 'none';
    if (totalHits >= 3) strength = 'strong';
    else if (totalHits >= 2) strength = 'moderate';

    let bias = 'neutral';
    if (totalHits >= 2) {
      bias = 'bearish';
    } else if (lastCandle.close > currentEma20 && ema20Slope > 0) {
      bias = 'bullish';
    }

    return {
      rules,
      hits: totalHits,
      strength,
      bias,
      reasons,
      metrics: metrics_values
    };
  }

  /**
   * Evalúa reglas alcistas (espejo simétrico)
   */
  evaluateBullishRules(candles, metrics) {
    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const prev2Candle = candles[candles.length - 3];
    
    const rules = {
      R1: false, // Rechazo abajo
      R2: false, // Engulfing verde grande
      R3: false, // Precio vs medias + pendiente
      R4: false, // Estructura creciente
      R5: false, // Volumen comprador anómalo
      R6: false  // Test exitoso de EMA20
    };

    const reasons = [];
    const metrics_values = {};

    // R1: Rechazo abajo
    const range = lastCandle.high - lastCandle.low;
    const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    const closePctInRange = (lastCandle.close - lastCandle.low) / range;
    
    if (lowerWick >= 0.5 * range && closePctInRange >= 0.60) {
      rules.R1 = true;
      reasons.push(`R1: Rechazo abajo (wick: ${(lowerWick/range*100).toFixed(1)}%, close: ${(closePctInRange*100).toFixed(1)}%)`);
    }
    metrics_values.lowerWickPct = (lowerWick/range*100).toFixed(1);
    metrics_values.closePctInRange = (closePctInRange*100).toFixed(1);

    // R2: Engulfing verde grande
    const bodySize = Math.abs(lastCandle.close - lastCandle.open);
    const bodyAvg = metrics.bodyAvg10[metrics.bodyAvg10.length - 1];
    
    if (lastCandle.close > lastCandle.open && bodySize >= 1.2 * bodyAvg) {
      rules.R2 = true;
      reasons.push(`R2: Engulfing verde grande (body: ${(bodySize/bodyAvg).toFixed(2)}x avg)`);
    }
    metrics_values.bodySize = bodySize.toFixed(2);
    metrics_values.bodyAvg = bodyAvg.toFixed(2);

    // R3: Precio vs medias + pendiente
    const currentEma20 = metrics.ema20[metrics.ema20.length - 1];
    const currentEma50 = metrics.ema50[metrics.ema50.length - 1];
    const ema20Slope = metrics.ema20Slope;
    
    if (lastCandle.close > currentEma20 && ema20Slope > 0) {
      rules.R3 = true;
      let confluencia = 0;
      if (lastCandle.close > currentEma50) confluencia += 0.5;
      if (currentEma20 > currentEma50) confluencia += 0.5;
      
      reasons.push(`R3: Precio vs medias + pendiente (close: $${lastCandle.close.toFixed(2)}, EMA20: $${currentEma20.toFixed(2)}, slope: ${ema20Slope.toFixed(4)})${confluencia > 0 ? ` + confluencia: ${confluencia}` : ''}`);
    }
    metrics_values.close = lastCandle.close.toFixed(2);
    metrics_values.ema20 = currentEma20.toFixed(2);
    metrics_values.ema50 = currentEma50.toFixed(2);
    metrics_values.ema20Slope = ema20Slope.toFixed(4);

    // R4: Estructura creciente (5 velas)
    if (candles.length >= 5) {
      const high1 = lastCandle.high;
      const low1 = lastCandle.low;
      const high3 = candles[candles.length - 4].high;
      const low3 = candles[candles.length - 4].low;
      
      if ((high1 > high3 && low1 > low3)) {
        rules.R4 = true;
        reasons.push(`R4: Estructura creciente (high: ${high1.toFixed(2)} > ${high3.toFixed(2)}, low: ${low1.toFixed(2)} > ${low3.toFixed(2)})`);
      }
    }

    // R5: Volumen comprador anómalo
    const currentVolume = lastCandle.volume;
    const sma20Vol = metrics.sma20Volume[metrics.sma20Volume.length - 1];
    const volumeRatio = currentVolume / sma20Vol;
    
    if (volumeRatio >= 1.5 && closePctInRange >= 0.66) {
      rules.R5 = true;
      reasons.push(`R5: Volumen comprador anómalo (vol: ${volumeRatio.toFixed(2)}x, close: ${(closePctInRange*100).toFixed(1)}%)`);
    }
    metrics_values.volumeRatio = volumeRatio.toFixed(2);

    // R6: Test exitoso de EMA20
    if (prevCandle && prev2Candle) {
      const prevTouchedEma20 = (prevCandle.low <= currentEma20 && prevCandle.high >= currentEma20);
      const prevClosedAboveEma20 = prevCandle.close >= currentEma20;
      const currentHigherHigh = lastCandle.high > prevCandle.high;
      
      if (prevTouchedEma20 && prevClosedAboveEma20 && currentHigherHigh) {
        rules.R6 = true;
        reasons.push(`R6: Test exitoso de EMA20 (prev touched EMA20, closed above, current higher high)`);
      }
    }

    // Calcular hits y confluencia
    const hits = Object.values(rules).filter(Boolean).length;
    const confluencia = (lastCandle.close > currentEma50 || currentEma20 > currentEma50) ? 0.5 : 0;
    const totalHits = hits + confluencia;

    // Determinar strength y bias
    let strength = 'none';
    if (totalHits >= 3) strength = 'strong';
    else if (totalHits >= 2) strength = 'moderate';

    let bias = 'neutral';
    if (totalHits >= 2) {
      bias = 'bullish';
    } else if (lastCandle.close < currentEma20 && ema20Slope < 0) {
      bias = 'bearish';
    }

    return {
      rules,
      hits: totalHits,
      strength,
      bias,
      reasons,
      metrics: metrics_values
    };
  }

  /**
   * Genera notas de trading
   */
  generateTradingNotes(bearish, bullish, candles, metrics) {
    const lastCandle = candles[candles.length - 1];
    const currentEma20 = metrics.ema20[metrics.ema20.length - 1];
    const atr = metrics.atr10[metrics.atr10.length - 1];
    
    const notes = {
      bearish: [],
      bullish: []
    };

    if (bearish.bias === 'bearish') {
      notes.bearish.push(`Vender rebotes a EMA20 ($${currentEma20.toFixed(2)})`);
      notes.bearish.push(`SL sobre último swing high`);
      notes.bearish.push(`TP en mínimo reciente / 1×ATR (${atr.toFixed(2)})`);
    }

    if (bullish.bias === 'bullish') {
      notes.bullish.push(`Comprar retrocesos a EMA20 ($${currentEma20.toFixed(2)})`);
      notes.bullish.push(`SL bajo último swing low`);
      notes.bullish.push(`TP en máximo reciente / 1×ATR (${atr.toFixed(2)})`);
    }

    return notes;
  }

  /**
   * Análisis principal
   */
  async analyze(endTime = null, limit = DEFAULT_LIMIT) {
    try {
      console.log('🚀 Iniciando análisis ETHUSDT 15m...\n');

      // 1. Obtener datos
      const rawKlines = await this.fetchKlines(limit, endTime);
      const candles = this.validateAndCleanData(rawKlines);
      
      if (!this.dataQuality.reliable) {
        console.log('⚠️ Datos no confiables - análisis limitado');
      }

      // 2. Calcular métricas
      console.log('📊 Calculando métricas técnicas...');
      const metrics = this.calculateMetrics(candles);

      // 3. Evaluar reglas
      console.log('🔍 Evaluando reglas bajistas...');
      const bearish = this.evaluateBearishRules(candles, metrics);
      
      console.log('🔍 Evaluando reglas alcistas...');
      const bullish = this.evaluateBullishRules(candles, metrics);

      // 4. Generar notas
      const notes = this.generateTradingNotes(bearish, bullish, candles, metrics);

      // 5. Resumen
      const dominantBias = bearish.hits > bullish.hits ? 'bearish' : 
                          bullish.hits > bearish.hits ? 'bullish' : 'neutral';
      
      const confidenceNote = this.dataQuality.reliable ? 
        'Análisis confiable' : 'Análisis limitado por calidad de datos';

      // 6. Información de tiempo
      const lastCandle = candles[candles.length - 1];
      const limaTime = new Date(lastCandle.openTime - (5 * 60 * 60 * 1000)); // UTC-5

      const timeInfo = {
        utc: new Date(lastCandle.openTime).toISOString(),
        lima: limaTime.toISOString(),
        timestamp: lastCandle.openTime
      };

      // 7. Resultado final
      const result = {
        summary: {
          bearishHits: bearish.hits,
          bullishHits: bullish.hits,
          dominantBias,
          confidenceNote
        },
        bearish: {
          bias: bearish.bias,
          strength: bearish.strength,
          hits: bearish.hits,
          reasons: bearish.reasons,
          metrics: bearish.metrics,
          time_info: timeInfo,
          data_quality: this.dataQuality,
          notes: notes.bearish
        },
        bullish: {
          bias: bullish.bias,
          strength: bullish.strength,
          hits: bullish.hits,
          reasons: bullish.reasons,
          metrics: bullish.metrics,
          time_info: timeInfo,
          data_quality: this.dataQuality,
          notes: notes.bullish
        },
        candles_info: {
          total: candles.length,
          first_candle: new Date(candles[0].openTime).toISOString(),
          last_candle: new Date(lastCandle.openTime).toISOString(),
          price_range: {
            high: Math.max(...candles.map(c => c.high)).toFixed(2),
            low: Math.min(...candles.map(c => c.low)).toFixed(2)
          }
        },
        last_candle_details: {
          open: lastCandle.open.toFixed(2),
          high: lastCandle.high.toFixed(2),
          low: lastCandle.low.toFixed(2),
          close: lastCandle.close.toFixed(2),
          volume: lastCandle.volume.toFixed(2),
          change: (((lastCandle.close - lastCandle.open) / lastCandle.open) * 100).toFixed(2)
        }
      };

      return result;

    } catch (error) {
      console.error('❌ Error en análisis:', error.message);
      throw error;
    }
  }
}

// Función principal
async function main() {
  const endTime = process.argv[2];
  const limit = parseInt(process.argv[3]) || DEFAULT_LIMIT;

  if (!endTime) {
    console.log('Uso: node ethusdt-analyzer.js <timestampUTC> [limit]');
    console.log('Ejemplo: node ethusdt-analyzer.js 2025-10-15T04:45:00.000Z 200');
    process.exit(1);
  }

  // Validar formato de timestamp
  const timestamp = new Date(endTime);
  if (isNaN(timestamp.getTime())) {
    console.log('❌ Error: Formato de timestamp inválido');
    console.log('Usa formato ISO: 2025-10-15T04:45:00.000Z');
    process.exit(1);
  }

  const analyzer = new ETHUSDTAnalyzer();
  const result = await analyzer.analyze(endTime, limit);
  
  console.log('\n' + '='.repeat(80));
  console.log('📈 ANÁLISIS ETHUSDT 15m - REPORTE TÉCNICO');
  console.log('='.repeat(80));
  
  console.log('\n🕯️ ÚLTIMA VELA:');
  console.log(`   Open: $${result.last_candle_details.open}`);
  console.log(`   High: $${result.last_candle_details.high}`);
  console.log(`   Low: $${result.last_candle_details.low}`);
  console.log(`   Close: $${result.last_candle_details.close}`);
  console.log(`   Volumen: ${result.last_candle_details.volume} ETH`);
  console.log(`   Cambio: ${result.last_candle_details.change}%`);
  
  console.log('\n📊 RESUMEN:');
  console.log(`   Sesgo dominante: ${result.summary.dominantBias.toUpperCase()}`);
  console.log(`   Hits bajistas: ${result.summary.bearishHits}`);
  console.log(`   Hits alcistas: ${result.summary.bullishHits}`);
  console.log(`   Confianza: ${result.summary.confidenceNote}`);
  
  console.log('\n🔻 ANÁLISIS BAJISTA:');
  console.log(`   Bias: ${result.bearish.bias.toUpperCase()}`);
  console.log(`   Strength: ${result.bearish.strength.toUpperCase()}`);
  console.log(`   Hits: ${result.bearish.hits}`);
  if (result.bearish.reasons.length > 0) {
    console.log('   Reglas activadas:');
    result.bearish.reasons.forEach(reason => console.log(`     • ${reason}`));
  }
  if (result.bearish.notes.length > 0) {
    console.log('   Notas de trading:');
    result.bearish.notes.forEach(note => console.log(`     • ${note}`));
  }
  
  console.log('\n🔺 ANÁLISIS ALCISTA:');
  console.log(`   Bias: ${result.bullish.bias.toUpperCase()}`);
  console.log(`   Strength: ${result.bullish.strength.toUpperCase()}`);
  console.log(`   Hits: ${result.bullish.hits}`);
  if (result.bullish.reasons.length > 0) {
    console.log('   Reglas activadas:');
    result.bullish.reasons.forEach(reason => console.log(`     • ${reason}`));
  }
  if (result.bullish.notes.length > 0) {
    console.log('   Notas de trading:');
    result.bullish.notes.forEach(note => console.log(`     • ${note}`));
  }
  
  console.log('\n📊 INFORMACIÓN DE VELAS:');
  console.log(`   Total velas: ${result.candles_info.total}`);
  console.log(`   Primera vela: ${result.candles_info.first_candle}`);
  console.log(`   Última vela: ${result.candles_info.last_candle}`);
  console.log(`   Rango de precios: $${result.candles_info.price_range.low} - $${result.candles_info.price_range.high}`);
  
  console.log('\n🕐 INFORMACIÓN DE TIEMPO:');
  console.log(`   UTC: ${result.bearish.time_info.utc}`);
  console.log(`   Lima: ${result.bearish.time_info.lima}`);
  
  console.log('\n✅ Análisis completado exitosamente');
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ETHUSDTAnalyzer };
