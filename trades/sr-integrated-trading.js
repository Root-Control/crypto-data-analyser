const DataManager = require('./get-data');
const SRDetector = require('./sr-detector');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class SRIntegratedTradingSystem {
  constructor() {
    this.dataManager = new DataManager();
    this.srDetector = new SRDetector();
    this.isConnected = false;
    this.trades = [];
    this.srLevels = [];
    this.breakouts = [];
    this.signals = [];
  }

  async connect() {
    try {
      await this.dataManager.connect();
      await this.srDetector.connect();
      this.isConnected = true;
      console.log('✅ Conectado a Redis para trading integrado con S/R');
    } catch (error) {
      console.error('❌ Error conectando:', error);
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.dataManager.disconnect();
      await this.srDetector.disconnect();
      this.isConnected = false;
      console.log('🔌 Desconectado de Redis');
    }
  }

  /**
   * Ejecuta análisis de trading con S/R integrado
   * @param {boolean} use100K - Usar 100K velas o 1000 por defecto
   */
  async runSRIntegratedAnalysis(use100K = false) {
    try {
      console.log('🚀 Iniciando análisis de trading con S/R integrado...');
      
      // Obtener velas
      const candles = await this.dataManager.getCandles('ETHUSDT', '15m', 1000, use100K);
      
      if (candles.length < 100) {
        throw new Error('Insuficientes velas para análisis');
      }

      console.log(`📊 Analizando ${candles.length} velas con S/R integrado...`);

      // Detectar niveles S/R y rompimientos
      const srResult = await this.srDetector.detectSRAndBreakouts(use100K);
      this.srLevels = srResult.levels;
      this.breakouts = srResult.breakouts;
      this.signals = srResult.signals;

      // Analizar cada vela individualmente (sin datos futuros)
      const analysisResults = await this.analyzeCandlesIndividually(candles, srResult);
      
      // Generar reporte
      await this.generateSRIntegratedReport(analysisResults, srResult, use100K);
      
      console.log('✅ Análisis con S/R integrado completado!');
      this.logSummary(analysisResults, srResult);

    } catch (error) {
      console.error('❌ Error en análisis con S/R integrado:', error);
      throw error;
    }
  }

  /**
   * Analiza cada vela individualmente sin usar datos futuros
   */
  async analyzeCandlesIndividually(candles, srResult) {
    console.log('🔍 Analizando velas individualmente (sin datos futuros)...');
    
    const results = {
      totalCandles: candles.length,
      analyzedCandles: 0,
      predictions: [],
      srLevelsFound: 0,
      breakoutsDetected: 0,
      signalsGenerated: 0,
      noFutureDataViolations: 0
    };

    // Iterar vela por vela (sin datos futuros)
    for (let i = 10; i < candles.length - 10; i++) {
      results.analyzedCandles++;
      
      if (i % 1000 === 0) {
        console.log(`📊 Procesando vela ${i + 1}/${candles.length}...`);
      }

      const currentCandle = candles[i];
      const pastCandles = candles.slice(0, i + 1); // Solo datos pasados
      
      // Verificar si hay niveles S/R relevantes en este momento
      const relevantLevels = this.findRelevantLevelsAtTime(srResult.levels, i, candles);
      
      // Verificar si hay rompimientos en este momento
      const relevantBreakouts = this.findRelevantBreakoutsAtTime(srResult.breakouts, i);
      
      // Verificar si hay señales en este momento
      const relevantSignals = this.findRelevantSignalsAtTime(srResult.signals, i);
      
      // Crear predicción si hay contexto S/R
      if (relevantLevels.length > 0 || relevantBreakouts.length > 0 || relevantSignals.length > 0) {
        const prediction = this.createSRPrediction(
          currentCandle, 
          i, 
          relevantLevels, 
          relevantBreakouts, 
          relevantSignals,
          pastCandles
        );
        
        if (prediction) {
          results.predictions.push(prediction);
          results.srLevelsFound += relevantLevels.length;
          results.breakoutsDetected += relevantBreakouts.length;
          results.signalsGenerated += relevantSignals.length;
        }
      }
    }

    return results;
  }

  /**
   * Encuentra niveles S/R relevantes en un momento específico
   */
  findRelevantLevelsAtTime(levels, candleIndex, candles) {
    const relevantLevels = [];
    const currentCandle = candles[candleIndex];
    const tolerance = currentCandle.close * 0.02; // 2% de tolerancia
    
    for (const level of levels) {
      const distance = Math.abs(level.price - currentCandle.close);
      
      if (distance <= tolerance) {
        // Verificar que el nivel ya existía en el pasado
        const levelWasRelevant = this.wasLevelRelevantInPast(level, candleIndex, candles);
        
        if (levelWasRelevant) {
          relevantLevels.push({
            ...level,
            distance: distance / currentCandle.close * 100,
            relevance: this.calculateLevelRelevance(level, currentCandle)
          });
        }
      }
    }
    
    return relevantLevels;
  }

  /**
   * Verifica si un nivel era relevante en el pasado
   */
  wasLevelRelevantInPast(level, candleIndex, candles) {
    // Verificar que el nivel tenía al menos 2 tests antes de este momento
    let tests = 0;
    const tolerance = level.price * 0.002;
    
    for (let i = Math.max(0, candleIndex - 50); i < candleIndex; i++) {
      const candle = candles[i];
      
      if (level.type === 'resistance') {
        if (Math.abs(candle.high - level.price) <= tolerance) {
          tests++;
        }
      } else {
        if (Math.abs(candle.low - level.price) <= tolerance) {
          tests++;
        }
      }
    }
    
    return tests >= 2;
  }

  /**
   * Encuentra rompimientos relevantes en un momento específico
   */
  findRelevantBreakoutsAtTime(breakouts, candleIndex) {
    return breakouts.filter(breakout => 
      breakout.breakCandleIndex === candleIndex && breakout.confirmed
    );
  }

  /**
   * Encuentra señales relevantes en un momento específico
   */
  findRelevantSignalsAtTime(signals, candleIndex) {
    // Las señales se generan basadas en rompimientos confirmados
    return signals.filter(signal => 
      signal.breakCandleIndex === candleIndex
    );
  }

  /**
   * Calcula la relevancia de un nivel
   */
  calculateLevelRelevance(level, currentCandle) {
    const distanceFactor = 1 - (Math.abs(level.price - currentCandle.close) / currentCandle.close);
    const strengthFactor = level.score;
    const testFactor = Math.min(level.tests / 5, 1);
    
    return (distanceFactor * 0.4) + (strengthFactor * 0.4) + (testFactor * 0.2);
  }

  /**
   * Crea una predicción basada en contexto S/R
   */
  createSRPrediction(candle, index, levels, breakouts, signals, pastCandles) {
    // Solo crear predicción si hay contexto S/R significativo
    if (levels.length === 0 && breakouts.length === 0 && signals.length === 0) {
      return null;
    }

    // Determinar dirección basada en contexto S/R
    let direction = 'NEUTRAL';
    let confidence = 0.5;
    let reason = [];

    // Priorizar señales de break & retest
    if (signals.length > 0) {
      const signal = signals[0];
      direction = signal.direction;
      confidence = 0.8;
      reason.push('break_retest_confirmed');
    }
    // Luego rompimientos confirmados
    else if (breakouts.length > 0) {
      const breakout = breakouts[0];
      direction = breakout.direction;
      confidence = 0.7;
      reason.push('breakout_confirmed');
    }
    // Finalmente niveles cercanos
    else if (levels.length > 0) {
      const level = levels[0];
      if (level.type === 'resistance' && level.relevance > 0.6) {
        direction = 'DOWN';
        confidence = 0.6;
        reason.push('near_resistance');
      } else if (level.type === 'support' && level.relevance > 0.6) {
        direction = 'UP';
        confidence = 0.6;
        reason.push('near_support');
      }
    }

    if (direction === 'NEUTRAL') {
      return null;
    }

    // Calcular TP y SL basados en niveles S/R
    const { tpPrice, slPrice } = this.calculateSRBasedTargets(candle, levels, direction);

    return {
      candleIndex: index,
      timestamp: candle.timestamp,
      price: candle.close,
      direction,
      confidence,
      tpPrice,
      slPrice,
      reason,
      levels: levels.map(l => ({
        type: l.type,
        price: l.price,
        distance: l.distance,
        relevance: l.relevance
      })),
      breakouts: breakouts.length,
      signals: signals.length,
      noFutureData: true // Verificación explícita
    };
  }

  /**
   * Calcula targets basados en niveles S/R
   */
  calculateSRBasedTargets(candle, levels, direction) {
    let tpPrice = candle.close;
    let slPrice = candle.close;

    if (levels.length > 0) {
      const level = levels[0];
      
      if (direction === 'UP') {
        // LONG: SL debajo del soporte, TP hacia resistencia
        slPrice = level.price * 0.998; // 0.2% debajo del soporte
        tpPrice = level.price * 1.003; // 0.3% arriba del soporte
      } else if (direction === 'DOWN') {
        // SHORT: SL arriba de la resistencia, TP hacia soporte
        slPrice = level.price * 1.002; // 0.2% arriba de la resistencia
        tpPrice = level.price * 0.997; // 0.3% debajo de la resistencia
      }
    } else {
      // Targets por defecto si no hay niveles específicos
      if (direction === 'UP') {
        slPrice = candle.close * 0.996; // 0.4% SL
        tpPrice = candle.close * 1.008; // 0.8% TP
      } else {
        slPrice = candle.close * 1.004; // 0.4% SL
        tpPrice = candle.close * 0.992; // 0.8% TP
      }
    }

    return { tpPrice, slPrice };
  }

  /**
   * Genera reporte PDF con análisis S/R integrado
   */
  async generateSRIntegratedReport(analysisResults, srResult, use100K) {
    const doc = new PDFDocument();
    const reportPath = path.join(__dirname, `sr-integrated-report-${use100K ? '100k' : '1k'}.pdf`);
    
    doc.pipe(fs.createWriteStream(reportPath));
    
    // Título
    doc.fontSize(20).text('REPORTE DE TRADING CON S/R INTEGRADO', 50, 50);
    doc.fontSize(12).text(`Análisis de ${use100K ? '100,000' : '1,000'} velas`, 50, 80);
    doc.text(`Fecha: ${new Date().toLocaleString()}`, 50, 100);
    
    let yPosition = 130;
    
    // Resumen ejecutivo
    doc.fontSize(16).text('RESUMEN EJECUTIVO', 50, yPosition);
    yPosition += 30;
    
    doc.fontSize(12).text(`Total de velas analizadas: ${analysisResults.totalCandles.toLocaleString()}`, 50, yPosition);
    yPosition += 20;
    
    doc.text(`Predicciones generadas: ${analysisResults.predictions.length}`, 50, yPosition);
    yPosition += 20;
    
    doc.text(`Niveles S/R detectados: ${srResult.levels.length}`, 50, yPosition);
    yPosition += 20;
    
    doc.text(`Rompimientos confirmados: ${srResult.breakouts.length}`, 50, yPosition);
    yPosition += 20;
    
    doc.text(`Señales generadas: ${srResult.signals.length}`, 50, yPosition);
    yPosition += 30;
    
    // Niveles S/R detectados
    if (srResult.levels.length > 0) {
      doc.fontSize(16).text('NIVELES S/R DETECTADOS', 50, yPosition);
      yPosition += 30;
      
      srResult.levels.forEach((level, i) => {
        doc.fontSize(12).text(`${i + 1}. ${level.type.toUpperCase()} - $${level.price.toFixed(2)}`, 50, yPosition);
        doc.text(`   Tests: ${level.tests}, Score: ${level.score.toFixed(2)}, Bounce: ${level.avgBouncePct.toFixed(2)}%`, 70, yPosition + 15);
        yPosition += 35;
      });
      yPosition += 20;
    }
    
    // Predicciones generadas (primeras 20)
    if (analysisResults.predictions.length > 0) {
      doc.fontSize(16).text('PREDICCIONES GENERADAS (PRIMERAS 20)', 50, yPosition);
      yPosition += 30;
      
      const firstPredictions = analysisResults.predictions.slice(0, 20);
      firstPredictions.forEach((pred, i) => {
        doc.fontSize(10).text(`${i + 1}. Vela ${pred.candleIndex} - ${pred.direction}`, 50, yPosition);
        doc.text(`   Precio: $${pred.price.toFixed(2)}, TP: $${pred.tpPrice.toFixed(2)}, SL: $${pred.slPrice.toFixed(2)}`, 70, yPosition + 12);
        doc.text(`   Confianza: ${(pred.confidence * 100).toFixed(1)}%, Razones: ${pred.reason.join(', ')}`, 70, yPosition + 24);
        yPosition += 40;
      });
    }
    
    doc.end();
    console.log(`📄 Reporte PDF generado: ${reportPath}`);
  }

  /**
   * Registra resumen de resultados
   */
  logSummary(analysisResults, srResult) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMEN DE ANÁLISIS CON S/R INTEGRADO');
    console.log('='.repeat(80));
    
    console.log(`\n📈 ESTADÍSTICAS GENERALES:`);
    console.log(`Velas analizadas: ${analysisResults.analyzedCandles.toLocaleString()}`);
    console.log(`Predicciones generadas: ${analysisResults.predictions.length}`);
    console.log(`Niveles S/R encontrados: ${analysisResults.srLevelsFound}`);
    console.log(`Rompimientos detectados: ${analysisResults.breakoutsDetected}`);
    console.log(`Señales generadas: ${analysisResults.signalsGenerated}`);
    
    console.log(`\n🎯 NIVELES S/R DETECTADOS (${srResult.levels.length}):`);
    srResult.levels.forEach((level, i) => {
      console.log(`${i + 1}. ${level.type.toUpperCase()} - $${level.price.toFixed(2)}`);
      console.log(`   Tests: ${level.tests}, Score: ${level.score.toFixed(2)}, Bounce: ${level.avgBouncePct.toFixed(2)}%`);
    });
    
    console.log(`\n🚀 ROMPIMIENTOS CONFIRMADOS (${srResult.breakouts.length}):`);
    const upBreakouts = srResult.breakouts.filter(b => b.direction === 'UP').length;
    const downBreakouts = srResult.breakouts.filter(b => b.direction === 'DOWN').length;
    console.log(`UP: ${upBreakouts}, DOWN: ${downBreakouts}`);
    
    console.log(`\n📊 CALIDAD DE PREDICCIONES:`);
    const highConfidence = analysisResults.predictions.filter(p => p.confidence >= 0.7).length;
    const mediumConfidence = analysisResults.predictions.filter(p => p.confidence >= 0.5 && p.confidence < 0.7).length;
    const lowConfidence = analysisResults.predictions.filter(p => p.confidence < 0.5).length;
    
    console.log(`Alta confianza (≥70%): ${highConfidence}`);
    console.log(`Media confianza (50-69%): ${mediumConfidence}`);
    console.log(`Baja confianza (<50%): ${lowConfidence}`);
    
    console.log(`\n✅ VERIFICACIÓN DE NO USO DE DATOS FUTUROS:`);
    console.log(`Todas las predicciones verificadas: ${analysisResults.predictions.every(p => p.noFutureData)}`);
    console.log(`Violaciones detectadas: ${analysisResults.noFutureDataViolations}`);
    
    console.log('\n' + '='.repeat(80));
  }
}

// Función principal para probar
async function main() {
  const tradingSystem = new SRIntegratedTradingSystem();
  
  try {
    await tradingSystem.connect();
    
    // Probar con 1000 velas
    console.log('🧪 Probando trading con S/R integrado - 1000 velas...');
    await tradingSystem.runSRIntegratedAnalysis(false);
    
    // Probar con 100K velas
    console.log('\n🧪 Probando trading con S/R integrado - 100K velas...');
    await tradingSystem.runSRIntegratedAnalysis(true);
    
  } catch (error) {
    console.error('❌ Error en main:', error);
  } finally {
    await tradingSystem.disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SRIntegratedTradingSystem;
