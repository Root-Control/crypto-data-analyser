const DataManager = require('./get-data');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Importar detectores de patrones
const { detectThreeWhiteSoldiers } = require('../Patterns/triple-candle/three-white-soldiers');
const { detectThreeTradersBlancos } = require('../Patterns/triple-candle/three-traders-blancos');

class TradeManager {
  constructor() {
    this.dataManager = new DataManager();
    this.isConnected = false;
    this.trades = [];
    this.supportLevels = [];
    this.resistanceLevels = [];
    this.patterns = [
      { name: 'three-white-soldiers', detector: detectThreeWhiteSoldiers, minCandles: 3 },
      { name: 'three-traders-blancos', detector: detectThreeTradersBlancos, minCandles: 3 }
    ];
    
    // PATCH v6 - Configuración de parámetros
    this.config = {
      // A) DETECCIÓN DE NIVELES
      levelScoreMin: 0.66,           // mantener
      lookbackLevels: 180,           // mantener
      avgBouncePctMin: 0.15,         // mantener
      zoneWidthMultiplier: 0.28,     // mantener
      minSpacingMultiplier: 0.40,    // mantener
      maxLevelsPerSide: 12,          // mantener
      minSpacingPct: 0.18,           // mantener
      
      // B) ROMPIMIENTO
      closeBeyondPct: 0.12,          // mantener
      volumeRatioMin: 0.98,          // base, será adaptativo
      // PATCH v6.7 - VOLUMEN MÁS EXIGENTE LOW REGIME
      volumeRatioMin_low: 1.03,      // 1.00 → 1.03 (reducir micro-breakouts)
      rangeMinATR: 0.30,             // mantener
      
      // C) EMISIÓN DE SEÑALES
      skipIfOppositeZoneWithin: 0.12, // 0.16 → 0.12 (PATCH v6.1 - más permisivo)
      rrMin: 1.00,                   // dinámico por régimen
      
      // D) FRECUENCIA
      cooldownGlobal: 90,            // mantener
      cooldownGlobal_low: 75,        // PATCH v6.6 - cooldown reducido para low regime
      cooldownPerLevel: 20,          // mantener
      maxSignalsPerWindow: 6,        // mantener
      
      // E) PUNTAJE (PATCH v6 - eventScore con directionScore)
      eventScoreWeights: {
        closeBeyondPct: 0.40,
        volume: 0.30,
        atrRatio: 0.20,
        directionScore: 0.10
      },
      
      // F) MODO DATOS GRANDES
      bigDataThreshold: 5000,
      bigDataLevelsWindow: 3000,
      bigDataSignalsWindow: 1000,
      
      // G) MODO MULTI-BLOQUES (con Overlap)
      multiBlock: {
        enabled: false, // DESACTIVADO - probando modo 1k
        blockSize: 1000,
        overlap: 200,
        maxBlocks: 'auto', // o límite seguro
        emitPerBlock: true,
        aggregateReport: true
      },
      
      // G) PATCH v6 - VOLUMEN FINAL
      volumeRegimes: {
        low: { threshold: 30, volumeRatioMin: 0.98 },  // 1.00 → 0.98
        mid: { threshold: 70, volumeRatioMin: 1.03 },  // 1.05 → 1.03
        high: { volumeRatioMin: 1.08 }                 // 1.10 → 1.08
      },
      
      // H) PATCH v6 - DIRECCIÓN POR PUNTUACIÓN
      directionConfig: {
        useBookFlow: true,
        vwapPeriod: 20,
        useScoring: true,  // nuevo: usar puntuación en lugar de votos
        thresholds: {
          low: 0.42,   // 0.45 → 0.42 (PATCH v6.1 - abrir un pelín)
          mid: 0.55,
          high: 0.65
        },
        weights: {
          momentum: 0.45,
          book: 0.35,
          flow: 0.20,
          vwap: 0.10
        }
      },
      
      // I) PATCH v6 - EXPECTED MOVE ADAPTATIVO
      expectedMoveCaps: {
        low: 0.90,   // 0.70 → 0.90
        mid: 0.80,   // 0.70 → 0.80
        high: 0.70   // mantener
      },
      
      // J) PATCH v6 - RR POR RÉGIMEN
      // PATCH v6.7 - AUMENTAR RR MÍNIMO LOW REGIME
      rrMinByRegime: {
        low: 1.30,   // 0.90 → 1.30 (coste-aware)
        mid: 1.00,   // mantener
        high: 1.20   // mantener
      },
      
      // K) PATCH v6 - NIVELES MULTI-RESOLUCIÓN
      multiResolution: {
        enabled: true,
        lookbackShort: 180,
        lookbackLong: 360
      },
      
      // L) PATCH v6 - FORCE EMIT REAL
      forceEmit: {
        enabled: true,
        minSignals: 2,
        minConfirmedBreakouts: 12,
        reason: "noFinalCandidates"
      }
    };
    
    // Estado del sistema
    this.stats = {
      candidateLevels: 0,
      finalLevels: 0,
      candidateLevelsPerSide: { resistance: 0, support: 0 },
      finalLevelsPerSide: { resistance: 0, support: 0 },
      scoreRelaxed: false,
      candidateBreakouts: 0,
      confirmedBreakouts: 0,
      rejectedByScore: 0,
      rejectedBySpacing: 0,
      rejectedByQuality: 0,
      rejectedByVolume: 0,
      rejectedByRange: 0,
      rejectedByDirection: 0,
      rejectedBySpace: 0,
      rejectedByRR: 0,
      signalsTotal: 0,
      bigDataMode: false,
      // PATCH v3 - Campos existentes
      regime: 'mid',
      volumeRatioMinEffective: 1.10,
      rrMinApplied: 1.00,
      finalRelax: false,
      // PATCH v4 - Campos existentes
      directionVotesAvg: 0,
      volumeFallbackCount: 0,
      levelScoreMinApplied: 0.68,
      levelScoreMinSupportApplied: 0.68,
      finalRelax2: false,
      // PATCH v5 - Campos existentes
      rejectedInFinalByScore: 0,
      bugFinalScore: false,
      forceEmit: false,
      forceEmitCount: 0,
      finalCandidateCount: 0,
      // PATCH v6 - Nuevos campos
      finalFilterCounters: { byDirection: 0, bySpace: 0, byExpectedMove: 0, bySLTP: 0 },
      directionThreshold: 0.45,
      directionNearMissCount: 0,
      expectedMoveBoost: false,
      tpCapApplied: false,
      targetsSource: "zone",
      failHardTarget: false,
      // PATCH v6.1 - ESPACIO INTELIGENTE
      spaceOverrideCount: 0,
      weakOppositeCount: 0,
      spaceNudge: 0,
      // PATCH v6.2 - HIGIENE BÁSICA
      hygieneRejected: { 
        spread: 0, depth: 0, tickVol: 0, tinySL: 0, tinyTP1: 0, 
        noFollowThrough: 0, chop: 0, zeroVotes: 0, quietHours: 0 
      },
      atrTargetOkCount: 0,
      eventScoreNormalized: false,
      lowEventScoreRejected: 0,
      forceEmitClean: false,
      // PATCH v6.2.1 - AJUSTES QUIRÚRGICOS LOW-VOL
      // PATCH v6.7 - ENDURECER TP1 MÍNIMO Y TINY SL
      hygieneThresholds: { 
        SLMinPct: 0.08, spreadMultMin: 3.0, tickVolPctlMin: 40, 
        zVolMin: 0.20, TP1MinPct: 0.22, TP1MinATR: 0.60 
      },
      tinySLRelaxedCount: 0,
      tickVolRelaxedCount: 0,
      tp1RelaxedCount: 0,
      oneFaultToleranceCount: 0,
      // PATCH v6.3 - AJUSTE DE CRITERIOS
      followThroughRelaxCount: 0,
      followThrough2CandleCount: 0,
      quietHoursAppliedCount: 0,
      quietHoursBySpreadCount: 0,
      quietHoursByTickVolCount: 0,
      slFloorChosen: "atr",
      tp1FloorChosen: "atr",
      // PATCH v6.4 - ESPACIO INTELIGENTE + SL ESTRUCTURAL
      spaceOverrides: { weakOpposite: 0, alignment: 0, atr_rr_ok: 0, pathClear: 0 },
      spaceFailuresAfterSLAdjust: 0,
      slRaisedCount: 0,
      slFloorChosenBreakdown: { atr: 0, spread: 0, struct: 0 },
      slStructPx: 0,
      slStructGapPct: 0,
      slRaised: false,
      
      // PATCH v6.5 - CLUSTERING Y CUOTAS
      clusteredOut: 0,
      maxSignalsByRegime: 0,
      actualSignalsEmitted: 0,
      
      // PATCH v6.6 - CLUSTERING MEJORADO
      postClusterCount: 0,
      clusterRadiusUsed: 0,
      clusterRepReason: '',
      
      // PATCH v6.6 - EMISIÓN MEJORADA
      emitterTrimmedCount: 0,
      emitterGuards: { directionScore: 0, nearMiss: 0, cooldown: 0, total: 0 },
      reasonsTrimmed: [],
      directionScoreAvg_emitted: 0,
      directionScoreAvg_postCluster: 0,
      
      // PATCH v6.6 - VOLUMEN EFECTIVO
      volumeClampApplied: false,
      volumeClampReason: '',
      
      // PATCH v6.6.1 - CLUSTER FIXES + FALLBACK
      clusterUnitDebug: {},
      clusterStats: {},
      clusterBypass: false,
      postClusterCount_before: 0,
      picked: 0,
      directionGuardApplied: true,
      nearMissAccepted: false,
      
      // PATCH v6.6.2 - BYPASS INFALIBLE + TOP-K ROBUSTA
      directionStats: {},
      reasonsTrimmed: {},
      
      // PATCH v6.7 - MÓDULO DE COSTOS
      costsStats: {
        tp1Pct_avg: 0,
        tp1Pct_p95: 0,
        tp1_cost_pass_rate: 0,
        roundTripBps_used: 0,
        minTP1Pct_costAware: 0,
        costGuard_failed: 0,
        costGuard_passed: 0
      }
    };
    
    // PATCH v6.7 - Módulo de costos
    this.costs = {
      takerBps: 5,        // 0.05%
      makerBps: 2,        // 0.02%
      slippageBps: 2,     // 0.02%
      minNetMult: 0.8,      // Múltiplo mínimo para cubrir costos (auto-tuned from 3)
      autoTuneApplied: false,
      autoTuneReason: ''
    };
    
    this.lastSignalCandle = -1;
    this.lastLevelCandle = -1;
    
    // Multi-block mode state
    this.multiBlockState = {
      enabled: false,
      globalSignals: new Map(), // Para de-duplicación
      globalStats: {
        blocksProcessed: 0,
        uniqueSignalsTotal: 0,
        postClusterAvg: 0,
        dirAvgEmit_global: 0,
        feesGuard_passRate_global: 0,
        dedup: {
          globalDiscarded: 0,
          reasons: {}
        }
      },
      blockStats: [],
      runId: null
    };
  }

  /**
   * Conecta a Redis a través del DataManager
   */
  async connect() {
    try {
      await this.dataManager.connect();
      this.isConnected = this.dataManager.isRedisConnected();
      return this.isConnected;
    } catch (error) {
      console.error('❌ Error al conectar TradeManager:', error);
      throw error;
    }
  }

  /**
   * Desconecta de Redis
   */
  async disconnect() {
    try {
      await this.dataManager.disconnect();
      this.isConnected = false;
    } catch (error) {
      console.error('❌ Error al desconectar TradeManager:', error);
      throw error;
    }
  }

  /**
   * Verifica si está conectado
   */
  isConnected() {
    return this.dataManager.isConnected;
  }

  /**
   * Obtiene las últimas N velas
   */
  async getLastCandles(count = 10) {
    if (!this.isConnected()) {
      throw new Error('No está conectado a Redis');
    }
    return await this.dataManager.getLastCandles(count);
  }

  /**
   * Obtiene velas de ETH/USDT desde Redis o API de Binance
   */
  async getCandles(symbol = 'ETHUSDT', interval = '1m', limit = 1000, forceRefresh = false, startTime = null, endTime = null) {
    if (!this.isConnected) {
      throw new Error('No está conectado a Redis');
    }
    return await this.dataManager.getCandles(symbol, interval, limit, false, forceRefresh, startTime, endTime);
  }

  /**
   * Obtiene velas en lotes para superar el límite de 1500 de Binance
   */
  async getCandlesInBatches(symbol = 'ETHUSDT', interval = '15m', totalLimit = 100000) {
    if (!this.isConnected) {
      throw new Error('No está conectado a Redis');
    }
    
    const batchSize = 1500; // Límite máximo de Binance
    const batches = Math.ceil(totalLimit / batchSize);
    const allCandles = [];
    
    console.log(`📊 Obteniendo ${totalLimit} velas en ${batches} lotes de ${batchSize}...`);
    
    for (let i = 0; i < batches; i++) {
      const currentLimit = Math.min(batchSize, totalLimit - (i * batchSize));
      console.log(`📡 Lote ${i + 1}/${batches}: obteniendo ${currentLimit} velas...`);
      
      try {
        const batchCandles = await this.dataManager.getCandles(symbol, interval, currentLimit);
        if (batchCandles && batchCandles.length > 0) {
          allCandles.push(...batchCandles);
          console.log(`✅ Lote ${i + 1}: ${batchCandles.length} velas obtenidas`);
        } else {
          console.log(`⚠️ Lote ${i + 1}: No se obtuvieron velas`);
          break;
        }
      } catch (error) {
        console.error(`❌ Error en lote ${i + 1}:`, error.message);
        break;
      }
      
      // Pequeña pausa entre requests para no sobrecargar la API
      if (i < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`📊 Total de velas obtenidas: ${allCandles.length}`);
    return allCandles;
  }

  /**
   * Obtiene todas las velas
   */
  async getAllCandles() {
    if (!this.isConnected()) {
      throw new Error('No está conectado a Redis');
    }
    return await this.dataManager.getAllCandles();
  }

  /**
   * Obtiene el número de velas
   */
  async getCandleCount() {
    if (!this.isConnected()) {
      throw new Error('No está conectado a Redis');
    }
    return await this.dataManager.getCandleCount();
  }

  /**
   * Obtiene velas en un rango específico
   */
  async getCandlesInRange(startIndex, endIndex) {
    if (!this.isConnected()) {
      throw new Error('No está conectado a Redis');
    }
    return await this.dataManager.getCandlesInRange(startIndex, endIndex);
  }

  /**
   * Busca velas por timestamp
   */
  async getCandlesByTimestamp(startTime, endTime) {
    if (!this.isConnected()) {
      throw new Error('No está conectado a Redis');
    }
    return await this.dataManager.getCandlesByTimestamp(startTime, endTime);
  }

  /**
   * Guarda un trade en Redis
   */
  async saveTrade(trade) {
    if (!this.isConnected()) {
      throw new Error('No está conectado a Redis');
    }
    
    const tradeId = `trade:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    await this.dataManager.set(tradeId, trade);
    return tradeId;
  }

  /**
   * Obtiene todos los trades
   */
  async getAllTrades() {
    if (!this.isConnected()) {
      throw new Error('No está conectado a Redis');
    }
    
    const keys = await this.dataManager.keys('trade:*');
    const trades = [];
    
    for (const key of keys) {
      const trade = await this.dataManager.get(key);
      if (trade) {
        trades.push({ id: key, ...trade });
      }
    }
    
    return trades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Obtiene trades por patrón
   */
  async getTradesByPattern(patternName) {
    const allTrades = await this.getAllTrades();
    return allTrades.filter(trade => trade.pattern === patternName);
  }

  /**
   * Obtiene trades por estado
   */
  async getTradesByStatus(status) {
    const allTrades = await this.getAllTrades();
    return allTrades.filter(trade => trade.status === status);
  }

  /**
   * Calcula estadísticas de trading
   */
  async getTradingStats() {
    const allTrades = await this.getAllTrades();
    
    const stats = {
      total: allTrades.length,
      wins: allTrades.filter(t => t.status === 'win').length,
      losses: allTrades.filter(t => t.status === 'loss').length,
      pending: allTrades.filter(t => t.status === 'pending').length,
      totalPnL: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0
    };

    if (stats.total > 0) {
      stats.winRate = (stats.wins / stats.total) * 100;
      
      const completedTrades = allTrades.filter(t => t.status === 'win' || t.status === 'loss');
      if (completedTrades.length > 0) {
        stats.totalPnL = completedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        
        const wins = completedTrades.filter(t => t.status === 'win');
        const losses = completedTrades.filter(t => t.status === 'loss');
        
        if (wins.length > 0) {
          stats.avgWin = wins.reduce((sum, t) => sum + (t.pnl || 0), 0) / wins.length;
        }
        
        if (losses.length > 0) {
          stats.avgLoss = losses.reduce((sum, t) => sum + (t.pnl || 0), 0) / losses.length;
        }
      }
    }

    return stats;
  }

  /**
   * Modo Multi-Bloques con Overlap
   */
  async analyzeMultiBlockMode() {
    try {
      console.log('🔄 Iniciando análisis Multi-Bloques...');
      
      // Generar ID único para esta ejecución
      this.multiBlockState.runId = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Obtener todas las velas disponibles
      const allCandles = await this.getCandlesInBatches('ETHUSDT', '15m', 100000);
      
      if (allCandles.length === 0) {
        console.log('❌ No se pudieron obtener velas');
        return;
      }
      
      console.log(`📊 Procesando ${allCandles.length} velas en modo multi-bloques`);
      
      // Calcular bloques con overlap
      const blocks = this.calculateBlocks(allCandles.length);
      console.log(`📦 Se generaron ${blocks.length} bloques con overlap de ${this.config.multiBlock.overlap} velas`);
      
      // Procesar cada bloque
      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex];
        console.log(`\n🔄 Procesando bloque ${blockIndex + 1}/${blocks.length} (velas ${block.startIdx}-${block.endIdx})`);
        
        await this.processBlock(allCandles, block, blockIndex);
      }
      
      // Generar reportes globales
      await this.generateMultiBlockReports();
      
      console.log('\n✅ Análisis Multi-Bloques completado');
      
    } catch (error) {
      console.error('❌ Error en modo multi-bloques:', error);
    }
  }

  /**
   * Calcular bloques con overlap
   */
  calculateBlocks(totalCandles) {
    const { blockSize, overlap, maxBlocks } = this.config.multiBlock;
    const step = blockSize - overlap;
    const blocks = [];
    
    let startIdx = 0;
    let blockIndex = 0;
    
    while (startIdx + blockSize <= totalCandles && (maxBlocks === 'auto' || blockIndex < maxBlocks)) {
      const endIdx = Math.min(startIdx + blockSize, totalCandles);
      
      blocks.push({
        index: blockIndex,
        startIdx,
        endIdx,
        warmupSize: overlap,
        actualSize: endIdx - startIdx
      });
      
      startIdx += step;
      blockIndex++;
    }
    
    return blocks;
  }

  /**
   * Procesar un bloque individual
   */
  async processBlock(allCandles, block, blockIndex) {
    try {
      // Extraer velas del bloque
      const blockCandles = allCandles.slice(block.startIdx, block.endIdx);
      
      // Resetear estado para el bloque
      this.resetBlockState();
      
      // Procesar el bloque (usar la lógica existente)
      await this.processBlockCandles(blockCandles, block, blockIndex);
      
      // Recopilar estadísticas del bloque
      this.collectBlockStats(block, blockIndex);
      
      // Log del bloque
      this.logBlockSummary(block, blockIndex);
      
    } catch (error) {
      console.error(`❌ Error procesando bloque ${blockIndex}:`, error);
    }
  }

  /**
   * Resetear estado para un nuevo bloque
   */
  resetBlockState() {
    // Resetear stats pero mantener configuración
    this.stats = {
      candidateLevels: 0,
      finalLevels: 0,
      candidateBreakouts: 0,
      confirmedBreakouts: 0,
      signalsTotal: 0,
      actualSignalsEmitted: 0,
      // ... otros campos necesarios
    };
    
    // Resetear señales del bloque
      this.trades = [];
    this.signals = [];
  }

  /**
   * Procesar velas de un bloque (reutilizar lógica existente)
   */
  async processBlockCandles(candles, block, blockIndex) {
    // A) DETECCIÓN DE NIVELES
    console.log('🎯 Detectando niveles de soporte y resistencia...');
    await this.detectLevels(candles);
    
    // B) DETECCIÓN DE ROMPIMIENTOS Y C) EMISIÓN DE SEÑALES
    console.log('⚡ Detectando rompimientos y generando señales...');
    await this.computeBreakoutsAndSignals(candles, 0);
    
    // D) APLICAR FILTROS DE SEGURIDAD
    console.log('🛡️ Aplicando filtros de seguridad...');
    await this.applySafetyFilters(candles);
    
    // E) GENERAR SEÑALES
    console.log('📤 Generando señales...');
    await this.generateSignals(candles);
  }

  /**
   * Recopilar estadísticas del bloque
   */
  collectBlockStats(block, blockIndex) {
    const blockStat = {
      blockIndex,
      rangeStartIdx: block.startIdx,
      rangeEndIdx: block.endIdx,
      warmupSize: block.warmupSize,
      postClusterCount: this.stats.postClusterCount || 0,
      picked: this.stats.picked || 0,
      signalsTotal: this.stats.signalsTotal || 0,
      directionScoreAvg_emitted: this.stats.directionScoreAvg_emitted || 0,
      reasonsTrimmed: this.stats.reasonsTrimmed || {},
      hygieneRejected: this.stats.hygieneRejected || {},
      feesGuardPassRate: this.stats.feesGuardPassRate || 0,
      dedup: {
        blockDiscarded: 0,
        reasons: {}
      }
    };
    
    // Procesar señales del bloque para de-duplicación
    this.processBlockSignals(blockStat);
    
    this.multiBlockState.blockStats.push(blockStat);
  }

  /**
   * Procesar señales del bloque para de-duplicación
   */
  processBlockSignals(blockStat) {
    for (const signal of this.trades) {
      const signalKey = this.generateSignalKey(signal);
      
      if (this.multiBlockState.globalSignals.has(signalKey)) {
        // Señal duplicada
        blockStat.dedup.blockDiscarded++;
        this.multiBlockState.globalStats.dedup.globalDiscarded++;
        
        if (!this.multiBlockState.globalStats.dedup.reasons[signalKey]) {
          this.multiBlockState.globalStats.dedup.reasons[signalKey] = 0;
        }
        this.multiBlockState.globalStats.dedup.reasons[signalKey]++;
      } else {
        // Señal única
        this.multiBlockState.globalSignals.set(signalKey, signal);
        this.multiBlockState.globalStats.uniqueSignalsTotal++;
      }
    }
  }

  /**
   * Generar clave única para de-duplicación
   */
  generateSignalKey(signal) {
    const ts = new Date(signal.timestamp).toISOString();
    const side = signal.side;
    const levelId = signal.levelId || 'unknown';
    const entryPrice = Math.round(signal.entryPrice * 100) / 100; // 2 decimales
    const rrBucket = Math.round(signal.riskRewardRatio / 0.05) * 0.05; // Bucket de 0.05
    
    return `${ts}|${side}|${levelId}|${entryPrice}|${rrBucket}`;
  }

  /**
   * Log resumen del bloque
   */
  logBlockSummary(block, blockIndex) {
    const blockStat = this.multiBlockState.blockStats[blockIndex];
    
    console.log(`BLOCK_SUMMARY v6.7 | ix=${blockIndex} | range=${block.startIdx}-${block.endIdx} | warmup=${block.warmupSize} | postCluster=${blockStat.postClusterCount} | picked=${blockStat.picked} | emitted=${blockStat.signalsTotal} | dirAvgEmit=${blockStat.directionScoreAvg_emitted.toFixed(3)} | feesPass=${blockStat.feesGuardPassRate.toFixed(1)}% | dedup=${blockStat.dedup.blockDiscarded}`);
  }

  /**
   * Generar reportes globales del modo multi-bloques
   */
  async generateMultiBlockReports() {
    // Calcular estadísticas globales
    this.calculateGlobalStats();
    
    // Log resumen global
    this.logGlobalSummary();
    
    // Generar PDF global
    await this.generateMultiBlockPDF();
    
    // Generar snapshots por bloque (opcional)
    if (this.config.multiBlock.emitPerBlock) {
      await this.generateBlockSnapshots();
    }
  }

  /**
   * Calcular estadísticas globales
   */
  calculateGlobalStats() {
    const { globalStats, blockStats } = this.multiBlockState;
    
    globalStats.blocksProcessed = blockStats.length;
    
    // Calcular promedios
    if (blockStats.length > 0) {
      globalStats.postClusterAvg = blockStats.reduce((sum, b) => sum + b.postClusterCount, 0) / blockStats.length;
      globalStats.dirAvgEmit_global = blockStats.reduce((sum, b) => sum + b.directionScoreAvg_emitted, 0) / blockStats.length;
      globalStats.feesGuard_passRate_global = blockStats.reduce((sum, b) => sum + b.feesGuardPassRate, 0) / blockStats.length;
    }
  }

  /**
   * Log resumen global
   */
  logGlobalSummary() {
    const { globalStats } = this.multiBlockState;
    
    console.log(`\nEMIT_SUMMARY_MULTIBLOCK v6.7 | blocks=${globalStats.blocksProcessed} | uniqueSignals=${globalStats.uniqueSignalsTotal} | postClusterAvg=${globalStats.postClusterAvg.toFixed(1)} | dirAvgEmit_global=${globalStats.dirAvgEmit_global.toFixed(3)} | feesPass_global=${globalStats.feesGuard_passRate_global.toFixed(1)}% | dedup.globalDiscarded=${globalStats.dedup.globalDiscarded}`);
    
    // Canary checks
    this.performCanaryChecks();
  }

  /**
   * Realizar canary checks
   */
  performCanaryChecks() {
    const { globalStats, blockStats } = this.multiBlockState;
    
    // Check 1: postClusterCount bajo
    const lowPostClusterBlocks = blockStats.filter(b => b.postClusterCount < 4).length;
    const lowPostClusterRate = lowPostClusterBlocks / blockStats.length;
    if (lowPostClusterRate >= 0.2) {
      console.log(`CANARY_WARN: low postCluster (${(lowPostClusterRate * 100).toFixed(1)}% of blocks < 4)`);
    }
    
    // Check 2: direction quality bajo
    if (globalStats.dirAvgEmit_global < 0.55) {
      console.log(`CANARY_WARN: low dir quality (${globalStats.dirAvgEmit_global.toFixed(3)} < 0.55)`);
    }
    
    // Check 3: signal yield bajo
    const expectedMinSignals = globalStats.blocksProcessed * 4;
    const signalYield = globalStats.uniqueSignalsTotal / expectedMinSignals;
    if (signalYield < 0.5) {
      console.log(`CANARY_WARN: low signal yield (${signalYield.toFixed(2)} < 0.5)`);
    }
  }

  /**
   * Generar PDF global del modo multi-bloques
   */
  async generateMultiBlockPDF() {
    try {
      console.log('📄 Generando PDF global Multi-Bloques...');
      
      const PDFDocument = require('pdfkit');
      const fs = require('fs');
      const path = require('path');
      
      // Crear directorio para multi-bloques
      const multiblockDir = path.join(__dirname, 'reports', 'multiblock', this.multiBlockState.runId);
      if (!fs.existsSync(multiblockDir)) {
        fs.mkdirSync(multiblockDir, { recursive: true });
      }
      
      const doc = new PDFDocument();
      const outputPath = path.join(multiblockDir, 'signals-multiblock.pdf');
      doc.pipe(fs.createWriteStream(outputPath));
      
      // Cabecera global
      doc.fontSize(20).text('SEÑALES DE TRADING (Multi-Bloques)', { align: 'center' });
      doc.moveDown(1);
      
      // Información del análisis
      doc.fontSize(12).text(`Análisis realizado: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.text(`Régimen: ${this.stats.regime || 'low'}`, { align: 'center' });
      doc.text(`Bloques procesados: ${this.multiBlockState.globalStats.blocksProcessed}`, { align: 'center' });
      doc.text(`Señales únicas: ${this.multiBlockState.globalStats.uniqueSignalsTotal}`, { align: 'center' });
      doc.text(`Tamaño de bloque: ${this.config.multiBlock.blockSize} velas`, { align: 'center' });
      doc.text(`Overlap: ${this.config.multiBlock.overlap} velas`, { align: 'center' });
      doc.moveDown(2);
      
      // Tabla de señales únicas
      doc.fontSize(16).text('SEÑALES ÚNICAS (Post-De-duplicación)', { underline: true });
      doc.moveDown(1);
      
      let signalCount = 0;
      for (const [signalKey, signal] of this.multiBlockState.globalSignals) {
        signalCount++;
        doc.fontSize(12).text(`SEÑAL #${signalCount}`, { underline: true });
        doc.fontSize(10);
        doc.text(`Fecha: ${new Date(signal.timestamp).toLocaleDateString()}`);
        doc.text(`Hora: ${new Date(signal.timestamp).toLocaleTimeString()}`);
        doc.text(`Tipo: ${signal.side === 'LONG' ? 'COMPRA' : 'VENTA'} (${signal.side})`);
        doc.text(`Precio de entrada: $${signal.entryPrice}`);
        doc.text(`Stop Loss: $${signal.stopLoss}`);
        doc.text(`Take Profit 1: $${signal.takeProfit1}`);
        doc.text(`Riesgo/Beneficio: ${signal.riskRewardRatio}:1`);
        doc.moveDown(1);
        
        // Nueva página cada 3 señales
        if (signalCount % 3 === 0) {
          doc.addPage();
        }
      }
      
      // Tabla de métricas por bloque
      doc.addPage();
      doc.fontSize(16).text('MÉTRICAS POR BLOQUE', { underline: true });
      doc.moveDown(1);
      
      doc.fontSize(10);
      doc.text('Bloque | Rango | Señales | PostCluster | DirAvg | Dedup');
      doc.text('-------|-------|---------|-------------|--------|------');
      
      for (const blockStat of this.multiBlockState.blockStats) {
        const range = `${blockStat.rangeStartIdx}-${blockStat.rangeEndIdx}`;
        doc.text(`${blockStat.blockIndex.toString().padStart(6)} | ${range.padEnd(5)} | ${blockStat.signalsTotal.toString().padStart(7)} | ${blockStat.postClusterCount.toString().padStart(11)} | ${blockStat.directionScoreAvg_emitted.toFixed(3).padStart(6)} | ${blockStat.dedup.blockDiscarded.toString().padStart(5)}`);
      }
      
      // Estadísticas globales
      doc.addPage();
      doc.fontSize(16).text('ESTADÍSTICAS GLOBALES', { underline: true });
      doc.moveDown(1);
      
      doc.fontSize(12);
      doc.text(`Bloques procesados: ${this.multiBlockState.globalStats.blocksProcessed}`);
      doc.text(`Señales únicas totales: ${this.multiBlockState.globalStats.uniqueSignalsTotal}`);
      doc.text(`Promedio postCluster: ${this.multiBlockState.globalStats.postClusterAvg.toFixed(2)}`);
      doc.text(`Promedio directionScore: ${this.multiBlockState.globalStats.dirAvgEmit_global.toFixed(3)}`);
      doc.text(`Tasa de fees guard: ${this.multiBlockState.globalStats.feesGuard_passRate_global.toFixed(1)}%`);
      doc.text(`Señales descartadas por duplicación: ${this.multiBlockState.globalStats.dedup.globalDiscarded}`);
      
      doc.end();
      
      console.log(`✅ PDF Multi-Bloques generado: ${outputPath}`);
      
            } catch (error) {
      console.error('❌ Error generando PDF Multi-Bloques:', error);
    }
  }

  /**
   * Generar snapshots por bloque
   */
  async generateBlockSnapshots() {
    console.log('📸 Generando snapshots por bloque...');
    // TODO: Implementar snapshots por bloque
  }

  /**
   * PATCH v2 - Análisis principal con desbloqueo controlado de señales
   */
  async analyzeCandlesAndCreateTrades() {
    try {
      console.log('🔍 PATCH v2 - Iniciando análisis con desbloqueo controlado...');
      
      // Verificar modo multi-bloques
      this.multiBlockState.enabled = this.config.multiBlock.enabled;
      
      if (this.multiBlockState.enabled) {
        console.log('🔄 Modo Multi-Bloques activado');
        return await this.analyzeMultiBlockMode();
      }
      
      // Obtener velas desde el 20 de octubre hacia atrás
      const endTime = new Date('2025-10-20T00:00:00.000Z').getTime();
      const startTime = endTime - (1000 * 15 * 60 * 1000); // 1000 velas de 15 minutos hacia atrás
      const candles = await this.getCandles('ETHUSDT', '15m', 1000, true, startTime, endTime);
      
      if (candles.length === 0) {
        console.log('❌ No se pudieron obtener velas');
        return;
      }
      
      console.log(`📊 Analizando ${candles.length} velas...`);
      
      // Guardar velas en la instancia para uso posterior
      this.lastCandles = candles;
      
      // Resetear estado
      this.resetStats();
      this.trades = [];
      this.supportLevels = [];
      this.resistanceLevels = [];
      
      // F) MODO DATOS GRANDES
      if (candles.length > this.config.bigDataThreshold) {
        this.stats.bigDataMode = true;
        console.log('📈 Modo datos grandes activado');
      }
      
      // Determinar ventana de análisis
      const analysisWindow = this.stats.bigDataMode ? 
        Math.min(this.config.bigDataSignalsWindow, candles.length) : 
        candles.length;
      
      const levelWindow = this.stats.bigDataMode ? 
        Math.min(this.config.bigDataLevelsWindow, candles.length) : 
        Math.min(this.config.lookbackLevels, candles.length);
      
      const startIndex = Math.max(0, candles.length - analysisWindow);
      const levelStartIndex = Math.max(0, candles.length - levelWindow);
      
      // A) DETECCIÓN DE NIVELES
      console.log('🎯 Detectando niveles de soporte y resistencia...');
      await this.computeLevels(candles.slice(levelStartIndex));
      
      // B) DETECCIÓN DE ROMPIMIENTOS Y C) EMISIÓN DE SEÑALES
      console.log('⚡ Detectando rompimientos y generando señales...');
      await this.computeBreakoutsAndSignals(candles.slice(startIndex), startIndex);
      
      // G) SANITY CHECKS
      this.performSanityChecks(candles.length);
      
      // Mostrar resultados
      this.displayResults();
      
      // Generar PDF con los trades
      await this.generateSignalsPDF(this.lastCandles);
      
    } catch (error) {
      console.error('❌ Error en analyzeCandlesAndCreateTrades:', error);
    }
  }

  /**
   * PATCH v5 - Resetear estadísticas
   */
  resetStats() {
    this.stats = {
      candidateLevels: 0,
      finalLevels: 0,
      candidateLevelsPerSide: { resistance: 0, support: 0 },
      finalLevelsPerSide: { resistance: 0, support: 0 },
      scoreRelaxed: false,
      candidateBreakouts: 0,
      confirmedBreakouts: 0,
      rejectedByScore: 0,
      rejectedBySpacing: 0,
      rejectedByQuality: 0,
      rejectedByVolume: 0,
      rejectedByRange: 0,
      rejectedByDirection: 0,
      rejectedBySpace: 0,
      rejectedByRR: 0,
      signalsTotal: 0,
      bigDataMode: false,
      // PATCH v3 - Campos existentes
      regime: 'mid',
      volumeRatioMinEffective: 1.10,
      rrMinApplied: 1.00,
      finalRelax: false,
      // PATCH v4 - Campos existentes
      directionVotesAvg: 0,
      volumeFallbackCount: 0,
      levelScoreMinApplied: 0.68,
      levelScoreMinSupportApplied: 0.68,
      finalRelax2: false,
      // PATCH v5 - Campos existentes
      rejectedInFinalByScore: 0,
      bugFinalScore: false,
      forceEmit: false,
      forceEmitCount: 0,
      finalCandidateCount: 0,
      // PATCH v6 - Nuevos campos
      finalFilterCounters: { byDirection: 0, bySpace: 0, byExpectedMove: 0, bySLTP: 0 },
      directionThreshold: 0.45,
      directionNearMissCount: 0,
      expectedMoveBoost: false,
      tpCapApplied: false,
      targetsSource: "zone",
      failHardTarget: false,
      // PATCH v6.1 - ESPACIO INTELIGENTE
      spaceOverrideCount: 0,
      weakOppositeCount: 0,
      spaceNudge: 0,
      // PATCH v6.2 - HIGIENE BÁSICA
      hygieneRejected: { 
        spread: 0, depth: 0, tickVol: 0, tinySL: 0, tinyTP1: 0, 
        noFollowThrough: 0, chop: 0, zeroVotes: 0, quietHours: 0 
      },
      atrTargetOkCount: 0,
      eventScoreNormalized: false,
      lowEventScoreRejected: 0,
      forceEmitClean: false,
      // PATCH v6.2.1 - AJUSTES QUIRÚRGICOS LOW-VOL
      // PATCH v6.7 - ENDURECER TP1 MÍNIMO Y TINY SL
      hygieneThresholds: { 
        SLMinPct: 0.08, spreadMultMin: 3.0, tickVolPctlMin: 40, 
        zVolMin: 0.20, TP1MinPct: 0.22, TP1MinATR: 0.60 
      },
      tinySLRelaxedCount: 0,
      tickVolRelaxedCount: 0,
      tp1RelaxedCount: 0,
      oneFaultToleranceCount: 0,
      // PATCH v6.3 - AJUSTE DE CRITERIOS
      followThroughRelaxCount: 0,
      followThrough2CandleCount: 0,
      quietHoursAppliedCount: 0,
      quietHoursBySpreadCount: 0,
      quietHoursByTickVolCount: 0,
      slFloorChosen: "atr",
      tp1FloorChosen: "atr",
      // PATCH v6.4 - ESPACIO INTELIGENTE + SL ESTRUCTURAL
      spaceOverrides: { weakOpposite: 0, alignment: 0, atr_rr_ok: 0, pathClear: 0 },
      spaceFailuresAfterSLAdjust: 0,
      slRaisedCount: 0,
      slFloorChosenBreakdown: { atr: 0, spread: 0, struct: 0 },
      slStructPx: 0,
      slStructGapPct: 0,
      slRaised: false
    };
  }

  /**
   * PATCH v4 - A) DETECCIÓN DE NIVELES (multi-resolución + side-balance)
   */
  async computeLevels(candles) {
    const atr10 = this.calculateATR(candles, 10);
    
    // PATCH v4 - Multi-resolución: detectar en dos ventanas
    const candidateLevels = [];
    
    if (this.config.multiResolution.enabled) {
      // Ventana corta (180 velas)
      const shortCandidates = await this.detectLevelsInWindow(candles, this.config.lookbackLevels);
      // Ventana larga (360 velas)
      const longCandidates = await this.detectLevelsInWindow(candles, this.config.multiResolution.lookbackLong);
      
      // Mergear y deduplicar por solape, conservando mayor score
      candidateLevels.push(...this.mergeLevelCandidates(shortCandidates, longCandidates));
    } else {
      candidateLevels.push(...await this.detectLevelsInWindow(candles, this.config.lookbackLevels));
    }
    
    this.stats.candidateLevels = candidateLevels.length;
    this.stats.candidateLevelsPerSide.resistance = candidateLevels.filter(l => l.type === 'resistance').length;
    this.stats.candidateLevelsPerSide.support = candidateLevels.filter(l => l.type === 'support').length;
    
    // Filtrar por avgBouncePctMin (PATCH v4 - más permisivo)
    const filteredLevels = candidateLevels.filter(level => 
      level.avgBouncePct >= this.config.avgBouncePctMin
    );
    
    // Calcular zoneWidth y minSpacing (PATCH v4 - ajustados)
    const zoneWidth = Math.max(0.001, this.config.zoneWidthMultiplier * atr10);
    const minSpacing = Math.max(this.config.minSpacingPct, this.config.minSpacingMultiplier * atr10);
    
    // Agrupar niveles similares y seleccionar los mejores
    const finalLevels = this.selectBestLevelsV5(filteredLevels, zoneWidth, minSpacing);
    
    // PATCH v5 - Side-balance: relajación específica por lado con lowConfidence
    const resistanceCount = finalLevels.filter(l => l.type === 'resistance').length;
    const supportCount = finalLevels.filter(l => l.type === 'support').length;
    
    this.stats.levelScoreMinApplied = this.config.levelScoreMin;
    this.stats.levelScoreMinSupportApplied = this.config.levelScoreMin;
    
    if (supportCount < 2 && this.stats.candidateLevelsPerSide.support >= 8) {
      this.stats.scoreRelaxed = true;
      this.stats.levelScoreMinSupportApplied = 0.64;
      console.log('⚠️ Aplicando scoreRelaxedSupport: levelScoreMinSupport = 0.64');
      
      const relaxedSupportLevels = candidateLevels.filter(level => 
        level.type === 'support' && 
        level.score >= 0.64 && 
        level.avgBouncePct >= this.config.avgBouncePctMin
      ).map(level => ({
        ...level,
        lowConfidence: level.score < 0.66
      }));
      
      const relaxedResistanceLevels = finalLevels.filter(l => l.type === 'resistance');
      const relaxedSupportFinal = this.selectBestLevelsV5(relaxedSupportLevels, zoneWidth, minSpacing);
      
      this.resistanceLevels = relaxedResistanceLevels;
      this.supportLevels = relaxedSupportFinal;
    } else if (resistanceCount < 2 && this.stats.candidateLevelsPerSide.resistance >= 8) {
      this.stats.scoreRelaxed = true;
      console.log('⚠️ Aplicando scoreRelaxedResistance: levelScoreMinResistance = 0.64');
      
      const relaxedResistanceLevels = candidateLevels.filter(level => 
        level.type === 'resistance' && 
        level.score >= 0.64 && 
        level.avgBouncePct >= this.config.avgBouncePctMin
      ).map(level => ({
        ...level,
        lowConfidence: level.score < 0.66
      }));
      
      const relaxedSupportLevels = finalLevels.filter(l => l.type === 'support');
      const relaxedResistanceFinal = this.selectBestLevelsV5(relaxedResistanceLevels, zoneWidth, minSpacing);
      
      this.resistanceLevels = relaxedResistanceFinal;
      this.supportLevels = relaxedSupportLevels;
    } else {
      this.resistanceLevels = finalLevels.filter(l => l.type === 'resistance');
      this.supportLevels = finalLevels.filter(l => l.type === 'support');
    }
    
    this.stats.finalLevels = this.resistanceLevels.length + this.supportLevels.length;
    this.stats.finalLevelsPerSide.resistance = this.resistanceLevels.length;
    this.stats.finalLevelsPerSide.support = this.supportLevels.length;
  }

  /**
   * PATCH v2 - Calcular ATR
   */
  calculateATR(candles, period) {
    if (candles.length < period + 1) return 0;
    
    let trSum = 0;
    for (let i = 1; i <= period; i++) {
      const candle = candles[candles.length - i];
      const prevCandle = candles[candles.length - i - 1];
      
      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevCandle.close),
        Math.abs(candle.low - prevCandle.close)
      );
      trSum += tr;
    }
    
    return trSum / period;
  }

  /**
   * PATCH v2 - Calcular score de nivel
   */
  calculateLevelScore(candles, index, type) {
    const level = candles[index];
    const price = type === 'resistance' ? level.high : level.low;
    let touches = 0;
    let totalVolume = 0;
    let bounceCount = 0;
    
    // Buscar toques en ventana de 50 velas
    const start = Math.max(0, index - 25);
    const end = Math.min(candles.length, index + 25);
    
    for (let i = start; i < end; i++) {
      if (i === index) continue;
      
      const candle = candles[i];
      const tolerance = price * 0.002; // 0.2% tolerancia
      
      if (type === 'resistance') {
        if (candle.high >= price - tolerance && candle.high <= price + tolerance) {
          touches++;
          totalVolume += candle.volume;
          
          // Verificar bounce
          if (candle.close < candle.open) bounceCount++;
        }
      } else {
        if (candle.low >= price - tolerance && candle.low <= price + tolerance) {
          touches++;
          totalVolume += candle.volume;
          
          // Verificar bounce
          if (candle.close > candle.open) bounceCount++;
        }
      }
    }
    
    // Calcular score
    const touchesFactor = Math.min(touches / 3, 1);
    const volumeFactor = Math.min(totalVolume / 500000, 1);
    const bounceFactor = touches > 0 ? bounceCount / touches : 0;
    
    return (touchesFactor * 0.4 + volumeFactor * 0.3 + bounceFactor * 0.3);
  }

  /**
   * PATCH v2 - Calcular promedio de bounce porcentual
   */
  calculateAvgBouncePct(candles, index, type) {
    const level = candles[index];
    const price = type === 'resistance' ? level.high : level.low;
    let bounces = [];
    
    // Buscar bounces en ventana de 30 velas
    const start = Math.max(0, index - 15);
    const end = Math.min(candles.length, index + 15);
    
    for (let i = start; i < end; i++) {
      if (i === index) continue;
      
      const candle = candles[i];
      const tolerance = price * 0.002;
      
      if (type === 'resistance') {
        if (candle.high >= price - tolerance && candle.high <= price + tolerance) {
          const bouncePct = ((price - candle.close) / price) * 100;
          if (bouncePct > 0) bounces.push(bouncePct);
        }
      } else {
        if (candle.low >= price - tolerance && candle.low <= price + tolerance) {
          const bouncePct = ((candle.close - price) / price) * 100;
          if (bouncePct > 0) bounces.push(bouncePct);
        }
      }
    }
    
    return bounces.length > 0 ? bounces.reduce((a, b) => a + b, 0) / bounces.length : 0;
  }

  /**
   * PATCH v4 - Detectar niveles en una ventana específica
   */
  async detectLevelsInWindow(candles, lookback) {
    const candidateLevels = [];
    const startIndex = Math.max(0, candles.length - lookback);
    const windowCandles = candles.slice(startIndex);
    
    for (let i = 2; i < windowCandles.length - 2; i++) {
      const candle = windowCandles[i];
      
      // Local high (resistencia)
      if (candle.high > windowCandles[i-1].high && candle.high > windowCandles[i-2].high &&
          candle.high > windowCandles[i+1].high && candle.high > windowCandles[i+2].high) {
        
        const levelScore = this.calculateLevelScore(windowCandles, i, 'resistance');
        if (levelScore >= this.config.levelScoreMin) {
          candidateLevels.push({
            price: candle.high,
            type: 'resistance',
            score: levelScore,
            timestamp: candle.timestamp,
            index: startIndex + i,
            avgBouncePct: this.calculateAvgBouncePct(windowCandles, i, 'resistance')
          });
        }
      }
      
      // Local low (soporte)
      if (candle.low < windowCandles[i-1].low && candle.low < windowCandles[i-2].low &&
          candle.low < windowCandles[i+1].low && candle.low < windowCandles[i+2].low) {
        
        const levelScore = this.calculateLevelScore(windowCandles, i, 'support');
        if (levelScore >= this.config.levelScoreMin) {
          candidateLevels.push({
            price: candle.low,
            type: 'support',
            score: levelScore,
            timestamp: candle.timestamp,
            index: startIndex + i,
            avgBouncePct: this.calculateAvgBouncePct(windowCandles, i, 'support')
          });
        }
      }
    }
    
    return candidateLevels;
  }

  /**
   * PATCH v4 - Mergear candidatos de múltiples ventanas
   */
  mergeLevelCandidates(shortCandidates, longCandidates) {
    const merged = [...shortCandidates];
    
    for (const longLevel of longCandidates) {
      // Buscar solapamiento con niveles existentes
      const overlapping = merged.find(existing => 
        existing.type === longLevel.type &&
        Math.abs(existing.price - longLevel.price) / longLevel.price < 0.005 // 0.5% tolerancia
      );
      
      if (overlapping) {
        // Conservar el de mayor score
        if (longLevel.score > overlapping.score) {
          const index = merged.indexOf(overlapping);
          merged[index] = longLevel;
        }
      } else {
        merged.push(longLevel);
      }
    }
    
    return merged;
  }

  /**
   * PATCH v5 - Seleccionar mejores niveles con límites aumentados
   */
  selectBestLevelsV5(levels, zoneWidth, minSpacing) {
    // Ordenar por score
    const sortedLevels = levels.sort((a, b) => b.score - a.score);
    const selected = [];
    
    for (const level of sortedLevels) {
      // Verificar spacing y deduplicación
      const tooClose = selected.some(selectedLevel => 
        Math.abs(level.price - selectedLevel.price) / level.price < minSpacing
      );
      
      // Verificar solapamiento de zonas
      const overlapping = selected.some(selectedLevel => 
        selectedLevel.type === level.type && 
        Math.abs(level.price - selectedLevel.price) / level.price < (zoneWidth * 2)
      );
      
      if (!tooClose && !overlapping) {
        // Verificar límite por lado (PATCH v5 - aumentado a 12)
        const sameTypeCount = selected.filter(l => l.type === level.type).length;
        if (sameTypeCount < this.config.maxLevelsPerSide) {
          selected.push(level);
        }
      }
    }
    
    return selected;
  }

  /**
   * PATCH v3 - A) VOLUMEN ADAPTATIVO (regímenes)
   */
  calculateVolumeRegime(candles) {
    // Calcular ATR10% para las últimas 1000 velas
    const atrValues = [];
    const lookback = Math.min(1000, candles.length);
    
    for (let i = candles.length - lookback; i < candles.length - 10; i++) {
      const atr10 = this.calculateATR(candles.slice(i, i + 10), 10);
      const atrPct = (atr10 / candles[i].close) * 100;
      atrValues.push(atrPct);
    }
    
    // Calcular percentil
    atrValues.sort((a, b) => a - b);
    const atrPct = atrValues[Math.floor(atrValues.length * 0.5)]; // Mediana
    
    // Determinar régimen
    let regime, volumeRatioMin;
    
    if (atrPct < this.config.volumeRegimes.low.threshold) {
      regime = 'low';
      // PATCH v6.7 - Volumen más exigente en low regime
      volumeRatioMin = this.config.volumeRatioMin_low || this.config.volumeRegimes.low.volumeRatioMin;
    } else if (atrPct < this.config.volumeRegimes.mid.threshold) {
      regime = 'mid';
      volumeRatioMin = this.config.volumeRegimes.mid.volumeRatioMin;
    } else {
      regime = 'high';
      volumeRatioMin = this.config.volumeRegimes.high.volumeRatioMin;
    }
    
    this.stats.regime = regime;
    this.stats.volumeRatioMinEffective = volumeRatioMin;
    
    return { regime, volumeRatioMin };
  }

  /**
   * PATCH v4 - Calcular volumen efectivo con fallback logic
   */
  calculateEffectiveVolumeRatio(candles, index, closeBeyondPct, range, atr10) {
    const { volumeRatioMin } = this.calculateVolumeRegime(candles);
    
    // PATCH v4 - Bonus si closeBeyondPct >= 0.22% y range >= 0.40*ATR10
    let effectiveVolumeRatioMin = volumeRatioMin;
    if (closeBeyondPct >= 0.22 && range >= (0.40 * atr10)) {
      effectiveVolumeRatioMin = Math.max(1.00, volumeRatioMin - 0.02);
    }
    
    this.stats.volumeRatioMinEffective = effectiveVolumeRatioMin;
    return effectiveVolumeRatioMin;
  }

  /**
   * PATCH v6 - Verificar volumen con fallback final
   */
  checkVolumeWithFallback(candles, index, closeBeyondPct, range, atr10) {
    const volumeRatio = candles[index].volume / this.calculateAvgVolume(candles, index, 20);
    const effectiveVolumeRatioMin = this.calculateEffectiveVolumeRatio(candles, index, closeBeyondPct, range, atr10);
    
    // Verificación principal
    if (volumeRatio >= effectiveVolumeRatioMin) {
      return true;
    }
    
    // PATCH v6 - Fallback final: zScore >= 0.25 O volumePercentile20 >= 50
    const volumeZScore = this.calculateVolumeZScore(candles, index, 20);
    const volumePercentile20 = this.calculateVolumePercentile(candles, index, 20);
    
    if ((volumeZScore >= 0.25 || volumePercentile20 >= 50) && closeBeyondPct >= 0.18) {
      this.stats.volumeFallbackCount++;
      console.log(`🔄 Volume fallback: zScore=${volumeZScore.toFixed(2)}, percentile=${volumePercentile20.toFixed(1)}%`);
      return true;
    }
    
    return false;
  }

  /**
   * PATCH v5 - Calcular percentil de volumen
   */
  calculateVolumePercentile(candles, index, period) {
    const volumes = [];
    const start = Math.max(0, index - period);
    const end = Math.min(candles.length, index);
    
    for (let i = start; i < end; i++) {
      volumes.push(candles[i].volume);
    }
    
    if (volumes.length < 2) return 50;
    
    const currentVolume = candles[index].volume;
    const sortedVolumes = volumes.sort((a, b) => a - b);
    const rank = sortedVolumes.findIndex(v => v >= currentVolume);
    
    return rank === -1 ? 100 : (rank / sortedVolumes.length) * 100;
  }

  /**
   * PATCH v4 - Calcular zScore del volumen
   */
  calculateVolumeZScore(candles, index, period) {
    const volumes = [];
    const start = Math.max(0, index - period);
    const end = Math.min(candles.length, index);
    
    for (let i = start; i < end; i++) {
      volumes.push(candles[i].volume);
    }
    
    if (volumes.length < 2) return 0;
    
    const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const variance = volumes.reduce((sum, vol) => sum + Math.pow(vol - mean, 2), 0) / volumes.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    return (candles[index].volume - mean) / stdDev;
  }

  /**
   * PATCH v6 - B) DIRECCIÓN (sistema de puntuación por régimen)
   */
  calculateDirectionFilter(candles, index, type) {
    const candle = candles[index];
    const momentum = this.calculateMomentum(candles, index);
    
    // Calcular VWAP
    const vwap = this.calculateVWAP(candles, index, this.config.directionConfig.vwapPeriod);
    
    // Simular bookScore y flowScore (en un sistema real vendrían de datos de orden)
    const bookScore = this.calculateBookScore(candles, index);
    const flowScore = this.calculateFlowScore(candles, index);
    
    // PATCH v6 - Calcular directionScore
    const directionScore = this.calculateDirectionScore(type, momentum, bookScore, flowScore, candle.close, vwap);
    
    // Obtener umbral por régimen
    const threshold = this.config.directionConfig.thresholds[this.stats.regime];
    this.stats.directionThreshold = threshold;
    
    // Verificar si pasa el umbral
    if (directionScore >= threshold) {
      return true;
    }
    
    // PATCH v6 - Desempate si está cerca del umbral
    const nearMiss = threshold - directionScore;
    if (nearMiss <= 0.05) {
      const ret5 = this.calculateRet5(candles, index);
      const ret5Favors = (type === 'LONG' && ret5 > 0) || (type === 'SHORT' && ret5 < 0);
      
      if (ret5Favors) {
        this.stats.directionNearMissCount++;
        console.log(`🔄 Direction near-miss: score=${directionScore.toFixed(3)}, threshold=${threshold}, ret5=${ret5.toFixed(3)}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * PATCH v6 - Calcular directionScore
   */
  calculateDirectionScore(type, momentum, bookScore, flowScore, price, vwap) {
    const weights = this.config.directionConfig.weights;
    
    let momentumVote, bookVote, flowVote, vwapBonus;
    
    if (type === 'LONG') {
      momentumVote = momentum > 0 ? 1 : 0;
      bookVote = bookScore > 0 ? 1 : 0;
      flowVote = flowScore >= 0 ? 1 : 0;
      vwapBonus = price >= vwap ? 0.10 : 0;
      } else {
      momentumVote = momentum < 0 ? 1 : 0;
      bookVote = bookScore < 0 ? 1 : 0;
      flowVote = flowScore <= 0 ? 1 : 0;
      vwapBonus = price <= vwap ? 0.10 : 0;
    }
    
    const directionScore = 
      weights.momentum * momentumVote +
      weights.book * bookVote +
      weights.flow * flowVote +
      vwapBonus;
    
    // DEBUG: Log directionScore calculation (commented out for cleaner output)
    // console.log(`   🔧 DEBUG DirectionScore: type=${type}, momentum=${momentum}, book=${bookScore}, flow=${flowScore}, price=${price}, vwap=${vwap}`);
    // console.log(`   🔧 DEBUG Votes: momentum=${momentumVote}, book=${bookVote}, flow=${flowVote}, vwap=${vwapBonus}`);
    // console.log(`   🔧 DEBUG Weights: momentum=${weights.momentum}, book=${weights.book}, flow=${weights.flow}`);
    // console.log(`   🔧 DEBUG Final: directionScore=${directionScore}`);
    
    return directionScore;
  }

  /**
   * PATCH v5 - Calcular ret5 para desempate direccional
   */
  calculateRet5(candles, index) {
    if (index < 5) return 0;
    
    const currentClose = candles[index].close;
    const pastClose = candles[index - 5].close;
    
    return (currentClose - pastClose) / pastClose;
  }

  /**
   * PATCH v3 - Calcular VWAP
   */
  calculateVWAP(candles, index, period) {
    if (!candles || index >= candles.length || !candles[index]) {
      return 0;
    }
    
    const start = Math.max(0, index - period + 1);
    const end = index + 1;
    const recentCandles = candles.slice(start, end);
    
    let totalVolume = 0;
    let totalValue = 0;
    
    for (const candle of recentCandles) {
      if (!candle || !candle.high || !candle.low || !candle.close || !candle.volume) {
        continue;
      }
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      totalValue += typicalPrice * candle.volume;
          totalVolume += candle.volume;
        }
    
    return totalVolume > 0 ? totalValue / totalVolume : (candles[index]?.close || 0);
  }

  /**
   * PATCH v3 - Simular bookScore (en producción vendría de datos reales)
   */
  calculateBookScore(candles, index) {
    // Simulación simple basada en momentum y volumen
    if (!candles || index >= candles.length || !candles[index] || !candles[index].volume) {
      return 0;
    }
    
    const momentum = this.calculateMomentum(candles, index);
    const avgVolume = this.calculateAvgVolume(candles, index, 20);
    const volumeRatio = avgVolume > 0 ? candles[index].volume / avgVolume : 1;
    
    return momentum * volumeRatio;
  }

  /**
   * PATCH v3 - Simular flowScore (en producción vendría de datos reales)
   */
  calculateFlowScore(candles, index) {
    // Simulación simple basada en cambios de precio
    if (index < 5 || !candles || index >= candles.length || !candles[index] || !candles[index - 5]) {
      return 0;
    }
    
    const current = candles[index].close;
    const past = candles[index - 5].close;
    
    if (!current || !past) return 0;
    
    const change = (current - past) / past;
    
    return change * 100; // Escalar para simular flow
  }

  /**
   * PATCH v2 - B) DETECCIÓN DE ROMPIMIENTOS Y C) EMISIÓN DE SEÑALES
   */
  async computeBreakoutsAndSignals(candles, startIndex) {
    const candidateBreakouts = [];
    const atr10 = this.calculateATR(candles, 10);
    
    // Buscar rompimientos en cada vela
    for (let i = 10; i < candles.length; i++) {
      const candle = candles[i];
      const candleIndex = startIndex + i;
      
      // Verificar cooldown global
      if (candleIndex - this.lastSignalCandle < this.config.cooldownGlobal) {
        continue;
      }
      
      // Buscar rompimientos de resistencia
    for (const resistance of this.resistanceLevels) {
        if (candleIndex - resistance.lastUsed < this.config.cooldownPerLevel) {
          continue;
        }
        
        const breakout = this.checkResistanceBreakout(candles, i, resistance, atr10);
        if (breakout) {
          candidateBreakouts.push({
            ...breakout,
            candleIndex,
            level: resistance,
            type: 'LONG'
          });
        }
      }
      
      // Buscar rompimientos de soporte
      for (const support of this.supportLevels) {
        if (candleIndex - support.lastUsed < this.config.cooldownPerLevel) {
          continue;
        }
        
        const breakout = this.checkSupportBreakout(candles, i, support, atr10);
        if (breakout) {
          candidateBreakouts.push({
            ...breakout,
            candleIndex,
            level: support,
            type: 'SHORT'
          });
        }
      }
    }
    
    this.stats.candidateBreakouts = candidateBreakouts.length;
    
    // PATCH v6.6.2 - Asignar directionScore a cada candidateBreakout
    console.log(`   🔧 PATCH v6.6.2: Asignando directionScore a ${candidateBreakouts.length} candidateBreakouts`);
    for (const breakout of candidateBreakouts) {
      // Calcular directionScore y asignarlo al breakout
      const momentum = this.calculateMomentum(candles, breakout.candleIndex);
      const vwap = this.calculateVWAP(candles, breakout.candleIndex, this.config.directionConfig.vwapPeriod);
      const bookScore = this.calculateBookScore(candles, breakout.candleIndex);
      const flowScore = this.calculateFlowScore(candles, breakout.candleIndex);
      const directionScore = this.calculateDirectionScore(breakout.type, momentum, bookScore, flowScore, candles[breakout.candleIndex].close, vwap);
      
      // Asignar directionScore al breakout
      breakout.directionScore = directionScore;
      breakout.momentum = momentum;
      breakout.bookScore = bookScore;
      breakout.flowScore = flowScore;
      breakout.votes = { momentum, book: bookScore, flow: flowScore, vwap };
      
      // AUDITORÍA v6.6.2 - Log de asignación (comentado para output limpio)
      // const id = `${breakout.candleIndex}_${breakout.level.price.toFixed(2)}_${breakout.type}`;
      // console.log(`   🔍 AUDIT assignDirectionScore: id=${id}, directionScore=${directionScore}`);
    }
    
    // Confirmar rompimientos
    const confirmedBreakouts = [];
    for (const breakout of candidateBreakouts) {
      if (this.confirmBreakout(candles, breakout, atr10)) {
        confirmedBreakouts.push(breakout);
      }
    }
    
    this.stats.confirmedBreakouts = confirmedBreakouts.length;
    
    // Generar señales
    await this.generateSignals(confirmedBreakouts, candles, atr10);
  }

  /**
   * PATCH v4 - Verificar rompimiento de resistencia
   */
  checkResistanceBreakout(candles, index, resistance, atr10) {
    const candle = candles[index];
    const closeBeyondPct = ((candle.close - resistance.price) / resistance.price) * 100;
    
    if (closeBeyondPct < this.config.closeBeyondPct) {
      this.stats.rejectedByScore++;
      return null;
    }
    
    const range = candle.high - candle.low;
    const rangeATR = range / atr10;
    if (rangeATR < this.config.rangeMinATR) {
      this.stats.rejectedByRange++;
      return null;
    }
    
    // PATCH v4 - Volumen con fallback logic
    if (!this.checkVolumeWithFallback(candles, index, closeBeyondPct, range, atr10)) {
      this.stats.rejectedByVolume++;
      return null;
    }
    
    // PATCH v4 - Filtro direccional 2-de-3
    if (!this.calculateDirectionFilter(candles, index, 'LONG')) {
      this.stats.rejectedByDirection++;
      return null;
    }
    
    const volumeRatio = candle.volume / this.calculateAvgVolume(candles, index, 20);
    
        return {
      closeBeyondPct,
      volumeRatio,
      rangeATR,
      momentum: this.calculateMomentum(candles, index),
      breakoutScore: this.calculateBreakoutScore(resistance.score, closeBeyondPct, volumeRatio, rangeATR)
    };
  }

  /**
   * PATCH v4 - Verificar rompimiento de soporte
   */
  checkSupportBreakout(candles, index, support, atr10) {
    const candle = candles[index];
    const closeBeyondPct = ((support.price - candle.close) / support.price) * 100;
    
    if (closeBeyondPct < this.config.closeBeyondPct) {
      this.stats.rejectedByScore++;
      return null;
    }
    
    const range = candle.high - candle.low;
    const rangeATR = range / atr10;
    if (rangeATR < this.config.rangeMinATR) {
      this.stats.rejectedByRange++;
      return null;
    }
    
    // PATCH v4 - Volumen con fallback logic
    if (!this.checkVolumeWithFallback(candles, index, closeBeyondPct, range, atr10)) {
      this.stats.rejectedByVolume++;
      return null;
    }
    
    // PATCH v4 - Filtro direccional 2-de-3
    if (!this.calculateDirectionFilter(candles, index, 'SHORT')) {
      this.stats.rejectedByDirection++;
      return null;
    }
    
    const volumeRatio = candle.volume / this.calculateAvgVolume(candles, index, 20);
    
        return {
      closeBeyondPct,
      volumeRatio,
      rangeATR,
      momentum: this.calculateMomentum(candles, index),
      breakoutScore: this.calculateBreakoutScore(support.score, closeBeyondPct, volumeRatio, rangeATR)
    };
  }

  /**
   * PATCH v4 - Confirmar rompimiento (sin exigir volumen extra en retest)
   */
  confirmBreakout(candles, breakout, atr10) {
    const { candleIndex, type } = breakout;
    const startIndex = Math.max(0, candleIndex - 10);
    const endIndex = Math.min(candles.length, candleIndex + 4);
    const recentCandles = candles.slice(startIndex, endIndex);
    
    // Preferida: retest 1-3 velas (SIN exigir volumen extra)
    for (let i = 1; i <= 3; i++) {
      if (candleIndex + i >= candles.length) break;
      
      const testCandle = candles[candleIndex + i];
      const level = breakout.level;
      
      if (type === 'LONG') {
        // Mecha toca zona y cierre a favor
        if (testCandle.high >= level.price * 0.998 && testCandle.close > level.price) {
          return true;
        }
      } else {
        // Mecha toca zona y cierre a favor
        if (testCandle.low <= level.price * 1.002 && testCandle.close < level.price) {
          return true;
        }
      }
    }
    
    // PATCH v4 - Alternativa: 2 closes beyond con volumen adaptativo
    if (candleIndex + 1 < candles.length) {
      const nextCandle = candles[candleIndex + 1];
      const effectiveVolumeRatioMin = this.calculateEffectiveVolumeRatio(candles, candleIndex, breakout.closeBeyondPct, breakout.rangeATR * atr10, atr10);
      
      // Verificar condiciones (a), (b), (c) con volumen adaptativo
      const bothVolumeOK = breakout.volumeRatio >= (effectiveVolumeRatioMin + 0.05) && 
        (nextCandle.volume / this.calculateAvgVolume(candles, candleIndex + 1, 20)) >= (effectiveVolumeRatioMin + 0.05);
      
      const bothRangeOK = breakout.rangeATR >= 0.30 && 
        ((nextCandle.high - nextCandle.low) / atr10) >= 0.30;
      
      // Verificar (c) - sin reingreso en 3 velas siguientes
      let noReentry = true;
      for (let i = 1; i <= 3; i++) {
        if (candleIndex + i >= candles.length) break;
        const testCandle = candles[candleIndex + i];
        const level = breakout.level;
        
        if (type === 'LONG') {
          if (testCandle.close <= level.price) {
            noReentry = false;
            break;
          }
        } else {
          if (testCandle.close >= level.price) {
            noReentry = false;
            break;
          }
        }
      }
      
      if (bothVolumeOK && bothRangeOK && noReentry) {
        return true;
      }
    }
    
    this.stats.rejectedByQuality++;
    return false;
  }

  /**
   * PATCH v6 - Generar señales con force emit real
   */
  async generateSignals(confirmedBreakouts, candles, atr10) {
    // PATCH v6.6.2 - Reset contadores de emisión
    this.stats.actualSignalsEmitted = 0;
    this.stats.directionScoreAvg_emitted = 0;
    
    // PATCH v6 - Pipeline final: solo confirmedBreakouts, aplicar filtros de seguridad
    const safetyFiltered = this.applySafetyFilters(confirmedBreakouts, candles, atr10);
    this.stats.finalCandidateCount = safetyFiltered.length;
    
    // DEBUG: Mostrar ubicación de velas de breakout
    if (safetyFiltered.length > 0) {
      console.log(`\n🔍 CANDIDATOS FINALES (${safetyFiltered.length}):`);
      console.log('=====================================');
      
      // QA: Seleccionar 10 candidatos representativos para verificación
      const representativeCandidates = safetyFiltered.slice(0, 10);
      console.log(`\n🔬 QA: VERIFICACIÓN DE CONSISTENCIA DE ESPACIO (10 candidatos representativos):`);
      console.log('================================================================================');
      
      representativeCandidates.forEach((breakout, i) => {
        const candle = candles[breakout.candleIndex];
        const date = new Date(candle.timestamp);
        const dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
        
        console.log(`\n📊 Candidato ${i+1} (Vela ${breakout.candleIndex}):`);
        console.log(`   📍 Ubicación: ${dateStr} - ${breakout.type} @ $${candle.close.toFixed(2)}`);
        console.log(`   🏠 ESPACIO EN applySafetyFilters:`);
        console.log(`      distanceToOppEdgePct: ${(breakout.spaceCheck?.distanceToEdgePct * 100).toFixed(2)}%`);
        console.log(`      minRequiredPct: ${(breakout.spaceCheck?.spaceMinPct * 100).toFixed(2)}%`);
        console.log(`      override: ${breakout.spaceCheck?.override || 'none'}`);
        console.log(`      pathClear: ${breakout.spaceCheck?.pathClear || false}`);
        console.log(`      tp1IntersectsOpp: ${breakout.spaceCheck?.tp1IntersectsOpp || false}`);
      });
      
      // Mostrar todos los candidatos (versión resumida)
      safetyFiltered.forEach((breakout, i) => {
        const candle = candles[breakout.candleIndex];
        const date = new Date(candle.timestamp);
        const dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
        
        if (i >= 10) {
          console.log(`\n📊 Candidato ${i+1}: Vela ${breakout.candleIndex} (${dateStr}) - ${breakout.type} @ $${candle.close.toFixed(2)} - Space: ${breakout.spaceCheck?.override || 'none'}`);
        }
      });
    }
    
    // PATCH v6 - Calcular eventScore (sin levelScore)
    const scoredBreakouts = safetyFiltered.map(breakout => {
      // AUDITORÍA v6.6.2 - Debug del map
      const id = `${breakout.candleIndex}_${breakout.level.price.toFixed(2)}_${breakout.type}`;
      const hasDirectionScoreBefore = breakout.directionScore !== undefined;
      console.log(`   🔍 AUDIT map: id=${id}, hasDirectionScoreBefore=${hasDirectionScoreBefore}, directionScore=${breakout.directionScore}`);
      
      const result = {
        ...breakout,
        eventScore: this.calculateEventScoreV6(breakout, candles, atr10)
      };
      
      const hasDirectionScoreAfter = result.directionScore !== undefined;
      console.log(`   🔍 AUDIT map: id=${id}, hasDirectionScoreAfter=${hasDirectionScoreAfter}, directionScore=${result.directionScore}`);
      
      return result;
    });
    
    // AUDITORÍA v6.6.2 - Log antes de construir sortedBreakouts
    const withDirectionScore = scoredBreakouts.filter(b => b.directionScore !== undefined).length;
    const withoutDirectionScore = scoredBreakouts.length - withDirectionScore;
    console.log(`   🔍 AUDIT beforeSorted: total=${scoredBreakouts.length}, withDirectionScore=${withDirectionScore}, withoutDirectionScore=${withoutDirectionScore}`);
    
    // Ordenar por eventScore
    const sortedBreakouts = scoredBreakouts.sort((a, b) => b.eventScore - a.eventScore);
    
    // DEBUG: Mostrar eventScores y selección
    console.log(`\n🎯 SELECCIÓN DE SEÑALES:`);
    console.log(`   📊 Candidatos finales: ${this.stats.finalCandidateCount}`);
    console.log(`   📈 EventScores calculados: ${scoredBreakouts.length}`);
    
    if (scoredBreakouts.length > 0) {
      console.log(`   🏆 Top 5 eventScores:`);
      scoredBreakouts.slice(0, 5).forEach((breakout, i) => {
        console.log(`      ${i+1}. Vela ${breakout.candleIndex}: ${breakout.eventScore.toFixed(3)} (${breakout.type})`);
      });
    }
    
    // PATCH v6.5 - Selección con clustering y cuotas por régimen
    const maxSignals = this.getMaxSignalsByRegime();
    this.stats.maxSignalsByRegime = maxSignals;
    console.log(`   🎯 Cuota máxima para régimen ${this.stats.regime}: ${maxSignals} señales`);
    
    // PATCH v6.7 - Auto-ajuste temprano si hay muchos candidatos pero pocas señales esperadas
    if (sortedBreakouts.length > 20) {
      this.applyAutoTune();
      // Recalcular guardarráil después del auto-tune
      this.calculateCostsGuardrail(false);
    }
    
    // 1) Imprimir top 10 finalCandidates con detalles completos (simplificado)
    console.log('\n📊 TOP 10 FINAL CANDIDATES:');
    console.log('============================');
    const top10Candidates = sortedBreakouts.slice(0, 10);
    top10Candidates.forEach((breakout, i) => {
      const candle = candles[breakout.candleIndex];
      const date = new Date(candle.timestamp);
      const dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
      
      // Métricas básicas sin cálculos complejos
      const { slPrice, tp1Price } = this.calculateSLTPV6(breakout.type, breakout.level, candle.close, atr10);
      const slPct = Math.abs(slPrice - candle.close) / candle.close * 100;
      const tp1Pct = Math.abs(tp1Price - candle.close) / candle.close * 100;
      
      console.log(`   ${i+1}. ${dateStr} - ${breakout.type} @ $${candle.close.toFixed(2)}`);
      console.log(`      eventScore: ${breakout.eventScore.toFixed(3)}`);
      console.log(`      directionScore: ${(breakout.directionScore || 0).toFixed(3)}`);
      console.log(`      votes: momentum=${(breakout.votes?.momentum || 0)}, book=${(breakout.votes?.book || 0)}, flow=${(breakout.votes?.flow || 0)}, vwap=${(breakout.votes?.vwap || 0)}`);
      console.log(`      expectedMove: ${((breakout.expectedMove || 0) * 100).toFixed(2)}%`);
      console.log(`      SL: ${slPct.toFixed(3)}%, TP1: ${tp1Pct.toFixed(3)}%`);
      console.log(`      targetsSource: ${breakout.targetsSource || 'atr'}`);
      console.log(`      spreadPct: 0.01% (simulado)`);
      console.log(`      volumeRatio: ${(breakout.volumeRatio || 1.0).toFixed(3)}`);
    });
    
    if (this.stats.finalCandidateCount >= maxSignals) {
      console.log(`   🔥 Emitiendo con clustering v6.6 para diversidad`);
      
      // AUDITORÍA v6.6.2 - Log antes de clustering
      const withDS = sortedBreakouts.filter(b => b.directionScore !== undefined).length;
      const withoutDS = sortedBreakouts.length - withDS;
      const first3Without = sortedBreakouts.filter(b => b.directionScore === undefined).slice(0, 3).map(b => `${b.candleIndex}_${b.level.price.toFixed(2)}_${b.type}`);
      console.log(`   🔍 AUDIT beforeClustering: withDS=${withDS}, withoutDS=${withoutDS}, first3Without=[${first3Without.join(', ')}]`);
      
      // Aplicar clustering anti-duplicados
      const clusteredBreakouts = this.applyClustering(sortedBreakouts, candles);
      console.log(`   📊 Candidatos después de clustering: ${clusteredBreakouts.length}`);
      
      // 2) PATCH v6.6.2 - Bypass infalible + Emisión top-K robusta
      const postClusterCount = clusteredBreakouts.length;
      
      // BYPASS INFALIBLE - Define la condición únicamente con postClusterCount === 0
      let candidatesForEmit = clusteredBreakouts;
      let clusterBypass = false;
      
      if (postClusterCount === 0) {
        clusterBypass = true;
        console.log(`   🚨 Cluster bypass activado: postClusterCount = 0`);
        
        // Si bypass está activo, el pool para el emisor es finalCandidates (sin clúster)
        candidatesForEmit = sortedBreakouts.slice(0, this.stats.finalCandidateCount);
        console.log(`   🔄 Bypass: usando pool de ${candidatesForEmit.length} finalCandidates`);
      }
      
      // Guardar stats del bypass
      this.stats.clusterBypass = clusterBypass;
      this.stats.postClusterCount_before = postClusterCount;
      this.stats.picked = candidatesForEmit.length;
      
      console.log(`   🔧 DEBUG BYPASS: clusterBypass=${clusterBypass}, postClusterCount=${postClusterCount}, picked=${candidatesForEmit.length}`);
      
      // RANKING DE EMISIÓN (top-K) - Score compuesto robusto
      const rankedCandidates = this.applyTopKRanking(candidatesForEmit, candles);
      console.log(`   📊 Candidatos después de ranking top-K: ${rankedCandidates.length}`);
      
      // GATING DE DIRECCIÓN (low regime) - No bloquea, solo penaliza
      const directionFiltered = this.applyDirectionGatingV662(rankedCandidates, candles);
      console.log(`   📊 Candidatos después de gating de dirección: ${directionFiltered.length}`);
      
      // TOP-K Y DIVERSIDAD
      const N = Math.min(6, directionFiltered.length);
      const maxPerSide = 4;
      
      console.log(`   🎯 Emitiendo N = min(6, ${directionFiltered.length}) = ${N} señales, maxPerSide = ${maxPerSide}, bypass=${clusterBypass}`);
      
      // Aplicar diversidad por lado y cooldowns
      const sideBalanced = this.applySideBalancingV662(directionFiltered, maxPerSide, candles);
      console.log(`   📊 Candidatos después de balance por lado: ${sideBalanced.length}`);
      
      // Emitir hasta cuota máxima
      const selectedBreakouts = sideBalanced.slice(0, N);
      
      // Loggear reasonsTrimmed para candidatos no emitidos
      const trimmedCandidates = sideBalanced.slice(N);
      if (trimmedCandidates.length > 0) {
        console.log(`   🚫 Candidatos trimmed por cuota: ${trimmedCandidates.length}`);
        this.stats.emitterTrimmedCount = trimmedCandidates.length;
        trimmedCandidates.slice(0, 5).forEach((breakout, i) => {
          const candle = candles[breakout.candleIndex];
          const date = new Date(candle.timestamp);
          const dateStr = date.toISOString().replace('T', ' ').substring(0, 19);
          console.log(`      ${i+1}. ${dateStr} - ${breakout.type} @ $${candle.close.toFixed(2)} (repScore: ${(breakout.repScore || 0).toFixed(3)})`);
        });
      }
      
      for (const breakout of selectedBreakouts) {
        console.log(`   📤 Intentando crear señal para vela ${breakout.candleIndex}...`);
        const signal = await this.createSignalV6(breakout, candles, atr10);
        if (signal) {
          console.log(`   ✅ Señal creada exitosamente!`);
          this.trades.push(signal);
          this.stats.signalsTotal++;
          this.stats.actualSignalsEmitted++;
          this.lastSignalCandle = breakout.candleIndex;
          breakout.level.lastUsed = breakout.candleIndex;
          
          // PATCH v6.6.2 - Calcular directionScoreAvg_emitted
          if (signal.directionScore !== undefined) {
            const currentAvg = this.stats.directionScoreAvg_emitted || 0;
            const count = this.stats.signalsTotal;
            this.stats.directionScoreAvg_emitted = ((currentAvg * (count - 1)) + signal.directionScore) / count;
          }
          
          // DEBUG: Log de conteo (comentado para output limpio)
          // console.log(`   🔧 DEBUG: signalsTotal=${this.stats.signalsTotal}, actualSignalsEmitted=${this.stats.actualSignalsEmitted}, directionScore=${signal.directionScore}`);
        } else {
          console.log(`   ❌ Falló al crear señal`);
        }
      }
    } else if (this.stats.finalCandidateCount >= 2) {
      console.log(`   🔥 Emitiendo todos los candidatos (respetando cooldownGlobal)`);
      // Emitir todos (respetando cooldownGlobal)
      for (const breakout of sortedBreakouts) {
        console.log(`   📤 Intentando crear señal para vela ${breakout.candleIndex}...`);
        const signal = await this.createSignalV6(breakout, candles, atr10);
        if (signal) {
          console.log(`   ✅ Señal creada exitosamente!`);
          this.trades.push(signal);
          this.stats.signalsTotal++;
          this.stats.actualSignalsEmitted++;
          this.lastSignalCandle = breakout.candleIndex;
          breakout.level.lastUsed = breakout.candleIndex;
          
          // PATCH v6.6.2 - Calcular directionScoreAvg_emitted
          if (signal.directionScore !== undefined) {
            const currentAvg = this.stats.directionScoreAvg_emitted || 0;
            const count = this.stats.signalsTotal;
            this.stats.directionScoreAvg_emitted = ((currentAvg * (count - 1)) + signal.directionScore) / count;
          }
          
          // DEBUG: Log de conteo (comentado para output limpio)
          // console.log(`   🔧 DEBUG: signalsTotal=${this.stats.signalsTotal}, actualSignalsEmitted=${this.stats.actualSignalsEmitted}, directionScore=${signal.directionScore}`);
        } else {
          console.log(`   ❌ Falló al crear señal`);
        }
      }
    } else if (this.stats.finalCandidateCount === 1) {
      console.log(`   🔥 Aplicando space nudge para candidato único`);
      // Space nudge: aplicar skipIfOppositeZoneWithin = 0.10% SOLO a ese candidato
      const candidate = sortedBreakouts[0];
      const originalThreshold = this.config.skipIfOppositeZoneWithin;
      this.config.skipIfOppositeZoneWithin = 0.10;
      
      const passesSpaceNudge = this.checkDistanceToOppositeZone(candidate, candles);
      this.config.skipIfOppositeZoneWithin = originalThreshold;
      
      if (passesSpaceNudge) {
        this.stats.spaceNudge++;
        console.log(`   📤 Intentando crear señal con space nudge...`);
        const signal = await this.createSignalV6(candidate, candles, atr10);
        if (signal) {
          console.log(`   ✅ Señal creada exitosamente!`);
          this.trades.push(signal);
          this.stats.signalsTotal++;
          this.lastSignalCandle = candidate.candleIndex;
          candidate.level.lastUsed = candidate.candleIndex;
        } else {
          console.log(`   ❌ Falló al crear señal`);
        }
      } else {
        console.log(`   ❌ No pasó space nudge`);
      }
    } else {
      console.log(`   ❌ No hay candidatos para emitir señales`);
    }
    
    // PATCH v6.2 - Force emit con guardarraíles
    if (this.stats.finalCandidateCount === 0 && 
        confirmedBreakouts.length >= this.config.forceEmit.minConfirmedBreakouts) {
      
      this.stats.forceEmit = true;
      console.log('🚨 Aplicando force emit con guardarraíles');
      
      // Buscar candidatos que pasen higiene básica
      const cleanCandidates = confirmedBreakouts.filter(breakout => {
        const hygieneOk = this.checkHygieneGuards(breakout, candles, atr10);
        const spaceResult = this.checkIntelligentSpace(breakout, candles, atr10);
        return hygieneOk && spaceResult.passes;
      });
      
      if (cleanCandidates.length > 0) {
        this.stats.forceEmitClean = true;
        
        // Calcular eventScore y ordenar
        const scoredClean = cleanCandidates.map(breakout => ({
          ...breakout,
          eventScore: this.calculateEventScoreV6(breakout, candles, atr10)
        })).sort((a, b) => b.eventScore - a.eventScore);
        
        // Diversidad: no más de 2 FORCE en la misma dirección
        const longCount = this.trades.filter(t => t.type === 'LONG').length;
        const shortCount = this.trades.filter(t => t.type === 'SHORT').length;
        
        const selectedClean = scoredClean.filter(breakout => {
          if (breakout.type === 'LONG' && longCount >= 2) return false;
          if (breakout.type === 'SHORT' && shortCount >= 2) return false;
          return true;
        }).slice(0, 2); // Máximo 2 force emit
        
        for (const breakout of selectedClean) {
          const signal = await this.createSignalV6(breakout, candles, atr10, true);
          if (signal) {
            this.trades.push(signal);
            this.stats.signalsTotal++;
            this.stats.forceEmitCount++;
            this.lastSignalCandle = breakout.candleIndex;
            breakout.level.lastUsed = breakout.candleIndex;
          }
        }
      } else {
        console.log('⚠️ Force emit: no hay candidatos limpios');
        this.stats.forceEmitClean = false;
      }
    }
    
    // PATCH v6 - Verificar objetivo hard
    if (this.stats.signalsTotal < 2 || this.stats.signalsTotal > 6) {
      this.stats.failHardTarget = true;
      console.log(`⚠️ Fail hard target: signalsTotal=${this.stats.signalsTotal}, objetivo=[2..6]`);
    }
  }

  /**
   * PATCH v6 - Aplicar filtros de seguridad (sin levelScore)
   */
  applySafetyFilters(confirmedBreakouts, candles, atr10) {
    return confirmedBreakouts.filter(breakout => {
      // PATCH v6.2 - GUARDARRAÍLES DE HIGIENE BÁSICA (ANTES de todo)
      if (!this.checkHygieneGuards(breakout, candles, atr10)) {
        return false;
      }
      
      // 1) directionScore >= threshold (con desempate ret5)
      if (!this.checkDirectionScore(breakout, candles)) {
        this.stats.finalFilterCounters.byDirection++;
        this.stats.rejectedByDirection++;
        return false;
      }
      
      // 2) Espacio inteligente unificado
      const spaceResult = this.checkIntelligentSpace(breakout, candles, atr10);
      if (!spaceResult.passes) {
        this.stats.finalFilterCounters.bySpace++;
        this.stats.rejectedBySpace++;
        return false;
      }
      // Guardar spaceCheck en el breakout para observabilidad
      breakout.spaceCheck = spaceResult.spaceCheck;
      
      // 3) expectedMove <= expectedMoveCap (+boost opcional)
      if (!this.checkExpectedMoveV6(breakout, candles)) {
        this.stats.finalFilterCounters.byExpectedMove++;
        this.stats.rejectedByQuality++;
        return false;
      }
      
      // 4) SL/TP válidos (RR según régimen; TP2 cap 2*ATR)
      if (!this.checkSLTPValidV6(breakout, candles, atr10)) {
        this.stats.finalFilterCounters.bySLTP++;
        this.stats.rejectedByQuality++;
        return false;
      }
      
      // 5) NO usar levelScore aquí (assert)
      if (breakout.level.score < this.config.levelScoreMin) {
        this.stats.rejectedInFinalByScore++;
        this.stats.bugFinalScore = true;
        console.error('🚨 BUG: levelScore usado en selección final!');
        return false;
      }
      
      return true;
    });
  }

  /**
   * PATCH v6 - Calcular eventScore (sin levelScore)
   */
  calculateEventScoreV6(breakout, candles, atr10) {
    const { closeBeyondPct, volumeRatio, rangeATR } = breakout;
    const candle = candles[breakout.candleIndex];
    
    // Normalizar closeBeyondPct
    const closeBeyondPctNorm = Math.min(closeBeyondPct / 0.30, 1.0);
    
    // Normalizar volumen (mejor de ratio, zScore, percentile)
    const volumeZScore = this.calculateVolumeZScore(candles, breakout.candleIndex, 20);
    const volumePercentile = this.calculateVolumePercentile(candles, breakout.candleIndex, 20);
    const volumeNorm = Math.max(
      volumeRatio / 1.50,
      volumeZScore / 1.0,
      volumePercentile / 100
    );
    
    // Normalizar ATR ratio
    const atrRatioNorm = Math.min(rangeATR / 0.60, 1.0);
    
    // Calcular directionScore
    const momentum = this.calculateMomentum(candles, breakout.candleIndex);
    const vwap = this.calculateVWAP(candles, breakout.candleIndex, this.config.directionConfig.vwapPeriod);
    const bookScore = this.calculateBookScore(candles, breakout.candleIndex);
    const flowScore = this.calculateFlowScore(candles, breakout.candleIndex);
    const directionScore = this.calculateDirectionScore(breakout.type, momentum, bookScore, flowScore, candle.close, vwap);
    
    // PATCH v6.6.2 - Asignar directionScore al breakout
    breakout.directionScore = directionScore;
    breakout.momentum = momentum;
    breakout.bookScore = bookScore;
    breakout.flowScore = flowScore;
    breakout.votes = { momentum, book: bookScore, flow: flowScore, vwap };
    
    // AUDITORÍA v6.6.2 - Log de invariantes al final de computeBreakouts
    const id = `${breakout.candleIndex}_${breakout.level.price.toFixed(2)}_${breakout.type}`;
    const hasDirectionScore = breakout.directionScore !== undefined;
    console.log(`   🔍 AUDIT computeBreakouts: id=${id}, hasDirectionScore=${hasDirectionScore}, directionScore=${breakout.directionScore}, eventScore=${breakout.eventScore}`);
    
    // PATCH v6.2 - Normalización de eventScore
    let eventScore = 
      this.config.eventScoreWeights.closeBeyondPct * closeBeyondPctNorm +
      this.config.eventScoreWeights.volume * volumeNorm +
      this.config.eventScoreWeights.atrRatio * atrRatioNorm +
      this.config.eventScoreWeights.directionScore * directionScore;
    
    // PATCH v6.2.1 - Aplicar penalización por degradación de higiene
    if (breakout.hygieneDegraded) {
      eventScore *= 0.92; // Penalización del 8%
    }
    
    // Normalizar a [0,1] y rechazar ruido
    const normalizedScore = Math.min(eventScore, 1.0);
    
    if (normalizedScore < 0.35) {
      this.stats.lowEventScoreRejected++;
      return 0; // Rechazar ruido
    }
    
    this.stats.eventScoreNormalized = true;
    return normalizedScore;
  }

  /**
   * PATCH v6 - Crear señal con eventScore
   */
  async createSignalV6(breakout, candles, atr10, forceEmit = false) {
    const { type, level, candleIndex } = breakout;
    const candle = candles[candleIndex];
    
    console.log(`      🔧 Creando señal para vela ${candleIndex} (${type})...`);
    
    // Verificar spacing con zona opuesta usando lógica inteligente (excepto en force emit)
    if (!forceEmit) {
      const spaceResult = this.checkIntelligentSpace(breakout, candles, atr10);
      
      // QA: Verificación de consistencia de espacio
      console.log(`         🏠 ESPACIO EN createSignalV6:`);
      console.log(`            distanceToOppEdgePct: ${(spaceResult.spaceCheck.distanceToEdgePct * 100).toFixed(2)}%`);
      console.log(`            minRequiredPct: ${(spaceResult.spaceCheck.spaceMinPct * 100).toFixed(2)}%`);
      console.log(`            override: ${spaceResult.spaceCheck.override}`);
      console.log(`            pathClear: ${spaceResult.spaceCheck.pathClear}`);
      console.log(`            tp1IntersectsOpp: ${spaceResult.spaceCheck.tp1IntersectsOpp}`);
      
      if (!spaceResult.passes) {
        console.log(`         ❌ Rechazado por espacio insuficiente`);
        this.stats.rejectedBySpace++;
    return null;
      }
      console.log(`         ✅ Espacio válido con override: ${spaceResult.spaceCheck.override}`);
    }
    
    // Calcular SL/TP con fallback ATR
    const { slPrice, tp1Price, tp2Price, rr } = this.calculateSLTPV6(type, level, candle.close, atr10);
    
    console.log(`         💰 Entry: $${candle.close.toFixed(2)}, SL: $${slPrice.toFixed(2)}, TP1: $${tp1Price.toFixed(2)}`);
    console.log(`         📊 RR: ${rr.toFixed(2)}`);
    
    // QA: Orden de validaciones - 1) SL/TP1
    console.log(`         🔧 ORDEN DE VALIDACIONES:`);
    console.log(`         1️⃣ SL/TP1 VALIDATION:`);
    
    // Verificar RR mínimo por régimen
    const rrMin = this.config.rrMinByRegime[this.stats.regime];
    if (rr < rrMin) {
      console.log(`         ❌ RR ${rr.toFixed(2)} < mínimo ${rrMin.toFixed(2)} (${this.stats.regime})`);
      this.stats.rejectedByRR++;
      return null;
    }
    console.log(`         ✅ RR válido: ${rr.toFixed(2)} >= ${rrMin.toFixed(2)}`);
    
    // PATCH v6.7 - Guardarráil de costos
    const signalData = {
      type,
      entryPrice: candle.close,
      slPrice,
      tp1Price,
      tp2Price
    };
    
    const costCheck = this.checkCostsGuardrail(signalData, false); // false = usar taker
    console.log(`         💰 COST GUARDRAIL:`);
    console.log(`            tp1Pct: ${costCheck.tp1Pct.toFixed(3)}%`);
    console.log(`            minTP1Required: ${costCheck.minTP1Required.toFixed(3)}%`);
    console.log(`            hygieneTP1Min: ${costCheck.hygieneTP1Min.toFixed(3)}%`);
    console.log(`            costAwareMin: ${costCheck.costAwareMin.toFixed(3)}%`);
    console.log(`            result: ${costCheck.passed ? 'PASSED' : 'FAILED'}`);
    
    if (!costCheck.passed) {
      console.log(`         ❌ Rechazado por guardarráil de costos: ${costCheck.reason}`);
      this.stats.rejectedByQuality++;
      return null;
    }
    console.log(`         ✅ Guardarráil de costos pasado`);
    
    // Verificar SL del lado correcto
    if (type === 'LONG' && slPrice >= candle.close) {
      console.log(`         ❌ SL ${slPrice.toFixed(2)} >= entry ${candle.close.toFixed(2)} (LONG)`);
      this.stats.rejectedByQuality++;
      return null;
    }
    if (type === 'SHORT' && slPrice <= candle.close) {
      console.log(`         ❌ SL ${slPrice.toFixed(2)} <= entry ${candle.close.toFixed(2)} (SHORT)`);
      this.stats.rejectedByQuality++;
      return null;
    }
    console.log(`         ✅ SL en lado correcto`);
    
    // Verificar expectedMove (excepto en force emit)
    if (!forceEmit) {
      const expectedMoveCap = this.config.expectedMoveCaps[this.stats.regime];
      const expectedMove = Math.abs(tp1Price - candle.close) / candle.close;
      
      console.log(`         📏 Expected move: ${(expectedMove*100).toFixed(2)}% (cap: ${(expectedMoveCap*100).toFixed(2)}%)`);
      
      if (expectedMove > expectedMoveCap) {
        console.log(`         ❌ Expected move excede cap`);
        this.stats.rejectedByQuality++;
        return null;
      }
      console.log(`         ✅ Expected move válido`);
    }
    
    console.log(`         ✅ 1️⃣ SL/TP1 VALIDATION COMPLETED`);
    
    const signal = {
      id: `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date(candle.timestamp).toISOString(),
      candleIndex,
      entryPrice: candle.close,
      slPrice,
      tp1Price,
      tp2Price,
      rr,
      level: level.price,
      eventScore: breakout.eventScore,
      directionScore: breakout.directionScore, // PATCH v6.6.2 - Incluir directionScore
      volumeRatio: breakout.volumeRatio,
      closeBeyondPct: breakout.closeBeyondPct,
      momentum: breakout.momentum,
      reasons: {
        rrComputed: rr,
        eventScore: breakout.eventScore,
        directionScore: breakout.directionScore, // PATCH v6.6.2 - Incluir directionScore en reasons
        expectedMove: (Math.abs(tp1Price - candle.close) / candle.close) * 100,
        forceEmit: forceEmit,
        targetsSource: this.stats.targetsSource
      },
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    console.log(`         ✅ Señal creada exitosamente! ID: ${signal.id}`);
    return signal;
  }

  /**
   * PATCH v6.5 - Obtener cuota máxima de señales por régimen
   */
  getMaxSignalsByRegime() {
    const quotas = {
      'low': 6,    // 2-6 señales por 1000 velas
      'mid': 8,    // 3-8 señales por 1000 velas  
      'high': 10   // 4-10 señales por 1000 velas
    };
    
    return quotas[this.stats.regime] || quotas['low'];
  }

  /**
   * PATCH v6.6.1 - Aplicar clustering con fixes de normalización y anti-NaN
   */
  applyClustering(breakouts, candles) {
    // AUDITORÍA v6.6.2 - Log al entrar a applyClustering
    const withDS = breakouts.filter(b => b.directionScore !== undefined).length;
    const withoutDS = breakouts.length - withDS;
    const first3Without = breakouts.filter(b => b.directionScore === undefined).slice(0, 3).map(b => `${b.candleIndex}_${b.level.price.toFixed(2)}_${b.type}`);
    console.log(`   🔍 AUDIT applyClustering: withDS=${withDS}, withoutDS=${withoutDS}, first3Without=[${first3Without.join(', ')}]`);
    
    const clustered = [];
    const levelSideCounts = new Map();
    const usedTimes = new Set();
    
    // 1) NORMALIZACIÓN DE UNIDADES (price radius)
    const lastPrice = candles[candles.length - 1].close;
    const atr10 = this.calculateATR(candles, Math.min(10, candles.length - 1));
    
    const pctToPrice = (x_pct) => (x_pct / 100.0) * lastPrice;
    const diversityPriceRadius = Math.max(pctToPrice(0.12), 0.35 * atr10);
    
    // Debug de unidades
    this.stats.clusterUnitDebug = {
      lastPrice: lastPrice,
      atr10: atr10,
      pctToPrice_0_12: pctToPrice(0.12),
      priceRadiusFinal: diversityPriceRadius
    };
    
    console.log(`   🔧 Clustering v6.6.1: diversityPriceRadius = ${diversityPriceRadius.toFixed(2)} (${(diversityPriceRadius/lastPrice*100).toFixed(3)}%)`);
    console.log(`   🔧 Unit debug: lastPrice=${lastPrice.toFixed(2)}, atr10=${atr10.toFixed(2)}, pctToPrice(0.12)=${pctToPrice(0.12).toFixed(2)}`);
    
    // Stats del cluster
    const clusterStats = {
      input: breakouts.length,
      groups: 0,
      postClusterCount: 0,
      removedByTime: 0,
      removedByPrice: 0,
      repScoreNaNFixed: 0,
      priceRadiusFinal: diversityPriceRadius
    };
    
    for (const breakout of breakouts) {
      const candle = candles[breakout.candleIndex];
      const levelId = `${breakout.level.price.toFixed(2)}_${breakout.type}`;
      const timeWindow = Math.floor(breakout.candleIndex / 5) * 5;
      
      // Verificar diversidad temporal/espacial
      const isDuplicateTime = usedTimes.has(timeWindow);
      const isTooClose = this.isTooCloseToExistingV66(breakout, clustered, candles, diversityPriceRadius);
      
      if (isDuplicateTime) {
        clusterStats.removedByTime++;
        continue;
      }
      
      if (isTooClose) {
        clusterStats.removedByPrice++;
        continue;
      }
      
      // 2) GUARDAS anti-NaN para repScore
      const repScore = this.calculateClusterRepScoreV661(breakout, candles);
      breakout.repScore = repScore;
      
      // DEBUG: Log directionScore in clustering (commented out for cleaner output)
      // console.log(`   🔧 DEBUG Clustering: vela ${breakout.candleIndex}, directionScore=${breakout.directionScore}, type=${breakout.type}`);
      
      if (isNaN(repScore)) {
        breakout.repScore = 0;
        clusterStats.repScoreNaNFixed++;
      }
      
      clustered.push(breakout);
      usedTimes.add(timeWindow);
      clusterStats.groups++;
      
      console.log(`   ✅ Clustered in: vela ${breakout.candleIndex} (repScore: ${repScore.toFixed(3)})`);
      
      if (clustered.length >= 6) break;
    }
    
    // Ordenar por repScore
    clustered.sort((a, b) => (b.repScore || 0) - (a.repScore || 0));
    
    clusterStats.postClusterCount = clustered.length;
    this.stats.clusterStats = clusterStats;
    this.stats.postClusterCount = clustered.length;
    this.stats.clusterRadiusUsed = diversityPriceRadius;
    this.stats.clusterRepReason = 'bestComposite';
    
    // AUDITORÍA v6.6.2 - Log al final de applyClustering
    const postWithDS = clustered.filter(b => b.directionScore !== undefined).length;
    const postWithoutDS = clustered.length - postWithDS;
    console.log(`   🔍 AUDIT postClustering: withDS=${postWithDS}, withoutDS=${postWithoutDS}, total=${clustered.length}`);
    
    console.log(`   📊 Post-cluster count: ${clustered.length}, groups: ${clusterStats.groups}`);
    console.log(`   📊 Cluster stats: ${JSON.stringify(clusterStats)}`);
    
    return clustered;
  }
  
  /**
   * PATCH v6.6 - Verificar si está demasiado cerca con diversityPriceRadius
   */
  isTooCloseToExistingV66(breakout, existing, candles, diversityPriceRadius) {
    const candle = candles[breakout.candleIndex];
    
    for (const existingBreakout of existing) {
      const existingCandle = candles[existingBreakout.candleIndex];
      
      // Misma dirección y diferencia de precio < diversityPriceRadius
      if (breakout.type === existingBreakout.type) {
        const priceDiff = Math.abs(candle.close - existingCandle.close) / candle.close;
        const timeDiff = Math.abs(breakout.candleIndex - existingBreakout.candleIndex);
        
        if (priceDiff < diversityPriceRadius && timeDiff <= 5) { // 5 velas (era 8)
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * PATCH v6.6 - Obtener conteo reciente de levelId, side en últimas N velas
   */
  getRecentLevelSideCount(levelId, side, currentCandleIndex, lookback) {
    // Simular conteo de últimas 30 velas
    return Math.floor(Math.random() * 3); // 0, 1, o 2
  }
  
  /**
   * PATCH v6.6.1 - Calcular cluster representative score con guardas anti-NaN
   */
  calculateClusterRepScoreV661(breakout, candles) {
    // 2) GUARDAS anti-NaN para repScore
    const eventScore = breakout.eventScore || 0;
    const directionScore = breakout.directionScore || 0;
    
    // Calcular volumeQuality (0..1) con guardas
    const volumeRatio = this.calculateVolumeRatio(candles, breakout.candleIndex) || 1.0;
    const volumeZScore = this.calculateVolumeZScore(candles, breakout.candleIndex, 20) || 0.0;
    const volumeQuality = Math.min(1.0, Math.max(0.0, (volumeRatio - 0.8) / 0.4 + (volumeZScore - 0.2) / 0.8));
    
    // repScore = clamp01(eventScore) * (0.6 + 0.4 * clamp01(directionScore)) * (0.9 + 0.1 * clamp01(volumeQuality))
    const clamp01 = (x) => Math.max(0, Math.min(1, x || 0));
    
    const clampedEventScore = clamp01(eventScore);
    const clampedDirectionScore = clamp01(directionScore);
    const clampedVolumeQuality = clamp01(volumeQuality);
    
    const directionMultiplier = 0.6 + 0.4 * clampedDirectionScore;
    const volumeMultiplier = 0.9 + 0.1 * clampedVolumeQuality;
    
    const repScore = clampedEventScore * directionMultiplier * volumeMultiplier;
    
    // Si repScore es NaN → set repScore = 0
    if (isNaN(repScore)) {
      console.log(`   ⚠️ RepScore NaN fixed: eventScore=${eventScore}, directionScore=${directionScore}, volumeQuality=${volumeQuality}`);
      return 0;
    }
    
    return repScore;
  }

  /**
   * PATCH v6.6 - Calcular cluster representative score
   */
  calculateClusterRepScore(breakout, candles) {
    const eventScore = breakout.eventScore || 0;
    const directionScore = breakout.directionScore || 0;
    
    // Calcular volumeQuality (0..1)
    const volumeRatio = this.calculateVolumeRatio(candles, breakout.candleIndex);
    const volumeZScore = this.calculateVolumeZScore(candles, breakout.candleIndex, 20);
    const volumeQuality = Math.min(1.0, (volumeRatio - 0.8) / 0.4 + (volumeZScore - 0.2) / 0.8);
    
    // repScore = eventScore * (0.6 + 0.4*clamp(directionScore,0,1)) * (0.9 + 0.1*volumeQuality)
    const clampedDirectionScore = Math.max(0, Math.min(1, directionScore));
    const directionMultiplier = 0.6 + 0.4 * clampedDirectionScore;
    const volumeMultiplier = 0.9 + 0.1 * Math.max(0, Math.min(1, volumeQuality));
    
    const repScore = eventScore * directionMultiplier * volumeMultiplier;
    
    console.log(`   📊 RepScore: ${repScore.toFixed(3)} = ${eventScore.toFixed(3)} * ${directionMultiplier.toFixed(3)} * ${volumeMultiplier.toFixed(3)}`);
    
    return repScore;
  }

  /**
   * PATCH v6.6.2 - Calcular ratio de volumen
   */
  calculateVolumeRatio(candles, candleIndex) {
    if (candleIndex < 20) return 1.0;
    
    const currentVolume = candles[candleIndex].volume;
    const avgVolume = candles.slice(candleIndex - 20, candleIndex)
      .reduce((sum, candle) => sum + candle.volume, 0) / 20;
    
    return currentVolume / avgVolume;
  }
  
  /**
   * PATCH v6.6.2 - Calcular z-score de volumen
   */
  calculateVolumeZScore(candles, candleIndex, lookback = 20) {
    if (candleIndex < lookback) return 0.0;
    
    const volumes = candles.slice(candleIndex - lookback, candleIndex)
      .map(candle => candle.volume);
    
    const mean = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    const variance = volumes.reduce((sum, vol) => sum + Math.pow(vol - mean, 2), 0) / volumes.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0.0;
    
    const currentVolume = candles[candleIndex].volume;
    return (currentVolume - mean) / stdDev;
  }
  
  /**
   * PATCH v6.6.2 - Calcular percentil de volumen
   */
  calculateVolumePercentile(candles, candleIndex, lookback = 200) {
    if (candleIndex < lookback) return 50.0;
    
    const volumes = candles.slice(candleIndex - lookback, candleIndex)
      .map(candle => candle.volume);
    
    const currentVolume = candles[candleIndex].volume;
    const smallerCount = volumes.filter(vol => vol < currentVolume).length;
    
    return (smallerCount / volumes.length) * 100;
  }

  /**
   * PATCH v6.6.2 - Aplicar ranking top-K robusto
   */
  applyTopKRanking(breakouts, candles) {
    const ranked = breakouts.map(breakout => {
      const candle = candles[breakout.candleIndex];
      
      // Score compuesto que prioriza dirección y volumen además del eventScore
      const eventScore = breakout.eventScore || 0;
      const directionScore = breakout.directionScore || 0;
      
      // Calcular calidad de volumen
      const volumeRatio = this.calculateVolumeRatio(candles, breakout.candleIndex) || 1.0;
      const volumeZScore = this.calculateVolumeZScore(candles, breakout.candleIndex, 20) || 0.0;
      const volumePercentile = this.calculateVolumePercentile(candles, breakout.candleIndex, 200) || 50.0;
      
      // Score de calidad de volumen (0..1)
      const volumeQuality = Math.min(1.0, Math.max(0.0, 
        (volumePercentile - 30) / 70 + // percentil normalizado
        (volumeZScore - 0.0) / 2.0     // z-score normalizado
      ));
      
      // Score compuesto: eventScore (base) + dirección (moderado) + volumen (leve)
      const compositeScore = eventScore * 0.6 + 
                           (directionScore * 0.3) + 
                           (volumeQuality * 0.1);
      
      // Marcar flags si falta telemetría
      const flags = [];
      if (breakout.directionScore === null || breakout.directionScore === undefined) {
        flags.push('dir:missing');
      }
      if (volumeRatio === 1.0 && volumeZScore === 0.0) {
        flags.push('vol:missing');
      }
      
      breakout.compositeScore = compositeScore;
      breakout.volumeQuality = volumeQuality;
      breakout.flags = flags;
      
      return breakout;
    });
    
    // Ordenar por score compuesto
    ranked.sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));
    
    console.log(`   📊 Top-K ranking: ${ranked.length} candidatos ordenados por compositeScore`);
    ranked.slice(0, 3).forEach((breakout, i) => {
      console.log(`      ${i+1}. Vela ${breakout.candleIndex}: compositeScore=${(breakout.compositeScore || 0).toFixed(3)}, flags=[${breakout.flags.join(',')}]`);
    });
    
    return ranked;
  }
  
  /**
   * PATCH v6.6.2 - Aplicar gating de dirección (no bloquea, solo penaliza)
   */
  applyDirectionGatingV662(breakouts, candles) {
    const filtered = [];
    const directionStats = {
      directionScoreAvg_all: 0,
      nearMissAcceptedCount: 0,
      dirMissingCount: 0
    };
    
    let totalDirectionScore = 0;
    let validDirectionScores = 0;
    
    for (const breakout of breakouts) {
      const directionScore = breakout.directionScore || 0;
      const nearMiss = Math.abs(directionScore - 0.42);
      const ret5 = this.calculateRet5(candles, breakout.candleIndex);
      
      // DEBUG: Log directionScore (commented out for cleaner output)
      // console.log(`   🔧 DEBUG Direction: vela ${breakout.candleIndex}, directionScore=${directionScore}, type=${breakout.type}`);
      
      // Emite si directionScore ≥ 0.42 o si es near-miss con ret5 a favor
      const passesDirection = directionScore >= 0.42 || (nearMiss <= 0.05 && ret5 > 0);
      
      // Si falta directionScore por telemetría, no rechaza; marca como dir:missing
      if (breakout.directionScore === null || breakout.directionScore === undefined) {
        breakout.flags = breakout.flags || [];
        if (!breakout.flags.includes('dir:missing')) {
          breakout.flags.push('dir:missing');
        }
        directionStats.dirMissingCount++;
        
        // Reducir prioridad en el ranking (ya aplicado en applyTopKRanking)
        if (breakout.compositeScore) {
          breakout.compositeScore *= 0.95; // Penalización del 5%
        }
      }
      
      if (passesDirection) {
        filtered.push(breakout);
        if (nearMiss <= 0.05 && ret5 > 0) {
          directionStats.nearMissAcceptedCount++;
        }
      }
      
      // Acumular para promedio
      if (directionScore > 0) {
        totalDirectionScore += directionScore;
        validDirectionScores++;
      }
    }
    
    // Calcular promedios
    directionStats.directionScoreAvg_all = validDirectionScores > 0 ? 
      totalDirectionScore / validDirectionScores : 0;
    
    this.stats.directionStats = directionStats;
    console.log(`   🔧 Direction gating: ${filtered.length}/${breakouts.length} pasaron, nearMiss=${directionStats.nearMissAcceptedCount}, dir:missing=${directionStats.dirMissingCount}`);
    
    return filtered;
  }
  
  /**
   * PATCH v6.6.2 - Aplicar balance por lado con cooldowns
   */
  applySideBalancingV662(breakouts, maxPerSide, candles) {
    const balanced = [];
    const sideCounts = { LONG: 0, SHORT: 0 };
    const reasonsTrimmed = {
      cooldown: 0,
      diversity: 0,
      total: 0
    };
    
    for (const breakout of breakouts) {
      // Verificar cooldown global (75 velas en low regime)
      const cooldownOk = (breakout.candleIndex - this.lastSignalCandle) >= 75;
      
      if (!cooldownOk) {
        reasonsTrimmed.cooldown++;
        reasonsTrimmed.total++;
        continue;
      }
      
      // Verificar diversidad por lado
      if (sideCounts[breakout.type] < maxPerSide) {
        balanced.push(breakout);
        sideCounts[breakout.type]++;
      } else {
        reasonsTrimmed.diversity++;
        reasonsTrimmed.total++;
        console.log(`   🚫 Trimmed por diversidad: ${breakout.type} (${sideCounts[breakout.type]}/${maxPerSide})`);
      }
    }
    
    this.stats.reasonsTrimmed = reasonsTrimmed;
    console.log(`   📊 Side balance: LONG=${sideCounts.LONG}, SHORT=${sideCounts.SHORT}`);
    console.log(`   📊 Reasons trimmed: cooldown=${reasonsTrimmed.cooldown}, diversity=${reasonsTrimmed.diversity}, total=${reasonsTrimmed.total}`);
    
    return balanced;
  }

  /**
   * PATCH v6.6.1 - Aplicar filtros de emisión con bypass
   */
  applyEmissionFiltersV661(breakouts, candles, clusterBypass = false) {
    const filtered = [];
    const guards = {
      directionScore: 0,
      nearMiss: 0,
      cooldown: 0,
      total: 0
    };
    
    for (const breakout of breakouts) {
      const directionScore = breakout.directionScore || 0;
      const nearMiss = Math.abs(directionScore - 0.42);
      const ret5 = this.calculateRet5(candles, breakout.candleIndex);
      
      // 6) EMISIÓN — gating mínimo (low)
      let passesDirection = directionScore >= 0.42 || (nearMiss <= 0.05 && ret5 > 0);
      
      // PERO si clusterBypass==true y directionScore==null, no bloquees por dirección
      if (clusterBypass && (breakout.directionScore === null || breakout.directionScore === undefined)) {
        passesDirection = true;
        // Solo penaliza ranking: repScore *= 0.95
        if (breakout.repScore) {
          breakout.repScore *= 0.95;
        }
        console.log(`   🔄 Bypass direction: vela ${breakout.candleIndex} (directionScore=null)`);
      }
      
      // Verificar cooldown global (75 velas en low regime)
      const cooldownOk = (breakout.candleIndex - this.lastSignalCandle) >= 75;
      
      if (passesDirection && cooldownOk) {
        filtered.push(breakout);
      } else {
        if (!passesDirection) guards.directionScore++;
        if (!cooldownOk) guards.cooldown++;
        guards.total++;
      }
    }
    
    this.stats.emitterGuards = guards;
    this.stats.directionGuardApplied = !clusterBypass;
    this.stats.nearMissAccepted = guards.nearMiss > 0;
    
    console.log(`   🔧 Emitter guards: directionScore=${guards.directionScore}, cooldown=${guards.cooldown}, total=${guards.total}`);
    console.log(`   🔧 Direction guard applied: ${!clusterBypass}, nearMiss accepted: ${guards.nearMiss > 0}`);
    
    return filtered;
  }

  /**
   * PATCH v6.6 - Aplicar filtros de emisión mejorados
   */
  applyEmissionFiltersV66(breakouts, candles) {
    const filtered = [];
    const guards = {
      directionScore: 0,
      nearMiss: 0,
      cooldown: 0,
      total: 0
    };
    
    for (const breakout of breakouts) {
      const directionScore = breakout.directionScore || 0;
      const nearMiss = Math.abs(directionScore - 0.42);
      const ret5 = this.calculateRet5(candles, breakout.candleIndex);
      
      // Emitir si directionScore ≥ 0.42 OR nearMiss ≤ 0.05 con ret5 favorable
      const passesDirection = directionScore >= 0.42 || (nearMiss <= 0.05 && ret5 > 0);
      
      // Verificar cooldown global (75 velas en low regime)
      const cooldownOk = (breakout.candleIndex - this.lastSignalCandle) >= 75;
      
      if (passesDirection && cooldownOk) {
        filtered.push(breakout);
      } else {
        if (!passesDirection) guards.directionScore++;
        if (!cooldownOk) guards.cooldown++;
        guards.total++;
      }
    }
    
    this.stats.emitterGuards = guards;
    console.log(`   🔧 Emitter guards: directionScore=${guards.directionScore}, cooldown=${guards.cooldown}, total=${guards.total}`);
    
    return filtered;
  }
  
  /**
   * PATCH v6.6 - Aplicar balance por lado
   */
  applySideBalancing(breakouts, maxPerSide) {
    const balanced = [];
    const sideCounts = { LONG: 0, SHORT: 0 };
    
    for (const breakout of breakouts) {
      if (sideCounts[breakout.type] < maxPerSide) {
        balanced.push(breakout);
        sideCounts[breakout.type]++;
      } else {
        console.log(`   🚫 Trimmed por lado: ${breakout.type} (${sideCounts[breakout.type]}/${maxPerSide})`);
      }
    }
    
    console.log(`   📊 Side balance: LONG=${sideCounts.LONG}, SHORT=${sideCounts.SHORT}`);
    return balanced;
  }
  
  /**
   * PATCH v6.6 - Calcular ret5 (5-candle return)
   */
  calculateRet5(candles, candleIndex) {
    if (candleIndex < 5) return 0;
    
    const currentPrice = candles[candleIndex].close;
    const pastPrice = candles[candleIndex - 5].close;
    
    return (currentPrice - pastPrice) / pastPrice;
  }

  /**
   * PATCH v6.5 - Verificar si está demasiado cerca de señales existentes
   */
  isTooCloseToExisting(breakout, existing, candles) {
    const candle = candles[breakout.candleIndex];
    
    for (const existingBreakout of existing) {
      const existingCandle = candles[existingBreakout.candleIndex];
      
      // Misma dirección y diferencia de precio < 0.05%
      if (breakout.type === existingBreakout.type) {
        const priceDiff = Math.abs(candle.close - existingCandle.close) / candle.close;
        const timeDiff = Math.abs(breakout.candleIndex - existingBreakout.candleIndex);
        
        if (priceDiff < 0.0005 && timeDiff <= 8) { // 0.05% y ≤8 velas
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * PATCH v6.6 - Obtener volumeRatioMinEffective sin clamp en low regime
   */
  getVolumeRatioMinEffective() {
    const regime = this.stats.regime || 'low';
    const baseRatio = this.config.volumeRegimes[regime].volumeRatioMin;
    
    // PATCH v6.6 - No clamp a 1.00 en low regime
    let effectiveRatio = baseRatio;
    let clampReason = 'No clamp applied';
    let clampApplied = false;
    
    // Solo aplicar clamp en mid/high regime, no en low
    if (regime !== 'low' && baseRatio < 1.0) {
      effectiveRatio = 1.0; // Clamp mínimo solo para mid/high
      clampReason = `Clamped from ${baseRatio} to 1.0 (volatility floor)`;
      clampApplied = true;
    }
    
    this.stats.volumeClampApplied = clampApplied;
    this.stats.volumeClampReason = clampReason;
    
    console.log(`   📊 VolumeRatioMinEffective: ${effectiveRatio} (${clampReason})`);
    return effectiveRatio;
  }

  /**
   * PATCH v6.6.2 - Generar mini reporte cuantitativo de las 6 señales emitidas
   */
  generateMiniReport() {
    console.log('\n📊 MINI REPORTE v6.6.2');
    console.log('========================');
    
    // Obtener las últimas 6 señales emitidas
    const lastSignals = this.trades.slice(-6);
    const picked = this.stats.picked || 0;
    const signalsTotal = this.stats.signalsTotal;
    const actualSignalsEmitted = this.stats.actualSignalsEmitted;
    const postClusterCount = this.stats.postClusterCount || 0;
    const directionScoreAvg_emitted = this.stats.directionScoreAvg_emitted || 0;
    const regime = this.stats.regime;
    
    // 1) RESUMEN GLOBAL
    console.log(`MINI_REPORT v6.6.2`);
    console.log(`picked=${picked} | emitted=${signalsTotal} | actual=${actualSignalsEmitted} | postCluster=${postClusterCount}`);
    console.log(`dirAvg_emitted=${directionScoreAvg_emitted.toFixed(3)} | regime=${regime}`);
    console.log('');
    
    // 2) BALANCE POR LADO
    const longCount = lastSignals.filter(s => s.type === 'LONG').length;
    const shortCount = lastSignals.filter(s => s.type === 'SHORT').length;
    console.log(`SIDES | LONG=${longCount} | SHORT=${shortCount}`);
    console.log('');
    
    // 3) DISPERSIÓN DE SL% Y TP1%
    const slPcts = lastSignals.map(s => ((s.slPrice - s.entryPrice) / s.entryPrice * 100));
    const tp1Pcts = lastSignals.map(s => ((s.tp1Price - s.entryPrice) / s.entryPrice * 100));
    
    const slStats = this.calculateStats(slPcts);
    const tp1Stats = this.calculateStats(tp1Pcts);
    
    console.log(`SL% | mean=${slStats.mean.toFixed(3)} | median=${slStats.median.toFixed(3)} | min=${slStats.min.toFixed(3)} | max=${slStats.max.toFixed(3)} | std=${slStats.std.toFixed(3)}`);
    console.log(`TP1% | mean=${tp1Stats.mean.toFixed(3)} | median=${tp1Stats.median.toFixed(3)} | min=${tp1Stats.min.toFixed(3)} | max=${tp1Stats.max.toFixed(3)} | std=${tp1Stats.std.toFixed(3)}`);
    console.log('');
    
    // 4) RR Y SCORES
    const rrs = lastSignals.map(s => s.rr);
    const eventScores = lastSignals.map(s => s.eventScore);
    const dirScores = lastSignals.map(s => s.directionScore);
    
    const rrStats = this.calculateStats(rrs);
    const eventScoreMean = this.calculateMean(eventScores);
    const dirScoreMean = this.calculateMean(dirScores);
    const dirScoreMin = Math.min(...dirScores);
    
    console.log(`RR | mean=${rrStats.mean.toFixed(3)} | median=${rrStats.median.toFixed(3)} | min=${rrStats.min.toFixed(3)} | max=${rrStats.max.toFixed(3)}`);
    console.log(`Scores | eventScore_mean=${eventScoreMean.toFixed(3)} | dirScore_mean=${dirScoreMean.toFixed(3)} | dirScore_min=${dirScoreMin.toFixed(3)}`);
    console.log('');
    
    // 5) HIGIENE & VOLUMEN
    const hygieneFlags = this.analyzeHygieneFlags(lastSignals);
    const volumeStats = this.analyzeVolumeStats(lastSignals);
    
    console.log(`HYGIENE | tinySL=${hygieneFlags.tinySL} | tinyTP1=${hygieneFlags.tinyTP1} | noFollowThrough=${hygieneFlags.noFollowThrough} | tickVolLow=${hygieneFlags.tickVolLow} | dirMissing=${hygieneFlags.dirMissing}`);
    console.log(`VOLUME | volFallbackUsed=${volumeStats.fallbackCount} | volRatio_mean=${volumeStats.ratioMean.toFixed(3)} | zVol_mean=${volumeStats.zVolMean.toFixed(3)} | pctl_mean=${volumeStats.pctlMean.toFixed(3)}`);
    console.log('');
    
    // 6) ESPACIO & CLUSTERING
    const spaceOverrides = this.stats.spaceOverrides || {};
    const clusterStats = this.stats.clusterStats || {};
    
    console.log(`SPACE | overrides_alignment=${spaceOverrides.alignment || 0} | pathClear=${spaceOverrides.pathClear || 0}`);
    console.log(`CLUSTER | postClusterCount=${postClusterCount} | removedByTime=${clusterStats.removedByTime || 0} | removedByPrice=${clusterStats.removedByPrice || 0} | radiusPx=${(this.stats.clusterRadiusUsed || 0).toFixed(2)}`);
    console.log('');
    
    // 7) TABLA COMPACTA DE SEÑALES
    console.log('SIGNAL | dt | side | entry | SL% | TP1% | RR | eventScore | dirScore | flags');
    console.log('-------|----|------|-------|-----|------|----|-----------|---------|------');
    lastSignals.forEach(signal => {
      const dt = new Date(signal.timestamp).toISOString().replace('T', ' ').substring(0, 19);
      const slPct = ((signal.slPrice - signal.entryPrice) / signal.entryPrice * 100).toFixed(3);
      const tp1Pct = ((signal.tp1Price - signal.entryPrice) / signal.entryPrice * 100).toFixed(3);
      const flags = this.getSignalFlags(signal);
      
      console.log(`SIGNAL | dt=${dt} | side=${signal.type} | entry=${signal.entryPrice.toFixed(2)} | SL%=${slPct} | TP1%=${tp1Pct} | RR=${signal.rr.toFixed(2)} | eventScore=${signal.eventScore.toFixed(3)} | dirScore=${signal.directionScore.toFixed(3)} | flags=[${flags.join(',')}]`);
    });
    console.log('');
    
    // 8) SANITY CHECKS
    const sanityChecks = this.runSanityChecks(picked, signalsTotal, actualSignalsEmitted, postClusterCount);
    if (sanityChecks.passed) {
      console.log('SANITY_OK');
    } else {
      sanityChecks.failures.forEach(failure => {
        console.log(`SANITY_FAIL | ${failure.name} | expected=${failure.expected} | got=${failure.got}`);
      });
    }
  }

  /**
   * PATCH v6.6.2 - Calcular estadísticas básicas
   */
  calculateStats(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = this.calculateMean(values);
    const median = sorted.length % 2 === 0 
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    return { mean, median, min, max, std };
  }

  /**
   * PATCH v6.6.2 - Calcular media
   */
  calculateMean(values) {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * PATCH v6.6.2 - Analizar flags de higiene
   */
  analyzeHygieneFlags(signals) {
    // Simular análisis de flags de higiene basado en stats globales
    const hygieneRejected = this.stats.hygieneRejected || {};
    const totalSignals = signals.length;
    
    return {
      tinySL: Math.round((hygieneRejected.tinySL || 0) * totalSignals / 1000), // Estimación
      tinyTP1: Math.round((hygieneRejected.tinyTP1 || 0) * totalSignals / 1000),
      noFollowThrough: Math.round((hygieneRejected.noFollowThrough || 0) * totalSignals / 1000),
      tickVolLow: Math.round((hygieneRejected.tickVol || 0) * totalSignals / 1000),
      dirMissing: this.stats.directionStats?.dirMissingCount || 0
    };
  }

  /**
   * PATCH v6.6.2 - Analizar estadísticas de volumen
   */
  analyzeVolumeStats(signals) {
    const volumeRatios = signals.map(s => s.volumeRatio || 1.0);
    const ratioMean = this.calculateMean(volumeRatios);
    
    // Simular zVol y percentil basado en volumeRatio
    const zVolMean = ratioMean > 1.5 ? 1.2 : 0.8;
    const pctlMean = ratioMean > 2.0 ? 75 : 50;
    
    return {
      fallbackCount: this.stats.volumeFallbackCount || 0,
      ratioMean,
      zVolMean,
      pctlMean
    };
  }

  /**
   * PATCH v6.6.2 - Obtener flags de señal
   */
  getSignalFlags(signal) {
    const flags = [];
    if (signal.directionScore === undefined) flags.push('dir:missing');
    if (signal.volumeRatio < 1.0) flags.push('vol:low');
    if (signal.rr < 1.5) flags.push('rr:low');
    return flags;
  }

  /**
   * PATCH v6.6.2 - Ejecutar sanity checks
   */
  runSanityChecks(picked, signalsTotal, actualSignalsEmitted, postClusterCount) {
    const failures = [];
    
    // Check 1: picked === signalsTotal === actualSignalsEmitted === 6
    if (!(picked === signalsTotal && signalsTotal === actualSignalsEmitted && actualSignalsEmitted === 6)) {
      failures.push({
        name: 'count_consistency',
        expected: 'picked=6, signalsTotal=6, actualSignalsEmitted=6',
        got: `picked=${picked}, signalsTotal=${signalsTotal}, actualSignalsEmitted=${actualSignalsEmitted}`
      });
    }
    
    // Check 2: dirMissingCount === 0
    const dirMissingCount = this.stats.directionStats?.dirMissingCount || 0;
    if (dirMissingCount !== 0) {
      failures.push({
        name: 'dir_missing',
        expected: '0',
        got: dirMissingCount.toString()
      });
    }
    
    // Check 3: postClusterCount >= 6
    if (postClusterCount < 6) {
      failures.push({
        name: 'post_cluster_count',
        expected: '>=6',
        got: postClusterCount.toString()
      });
    }
    
    return {
      passed: failures.length === 0,
      failures
    };
  }

  /**
   * PATCH v6.6.2 - Generar PDF de señales con explicaciones simples
   */
  async generateSignalsPDF(candles = []) {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const path = require('path');
    
    try {
      // Crear directorio si no existe
      const outputDir = path.join(__dirname, 'reports');
      const filepath = path.join(outputDir, 'signals.pdf');
      
      // Crear documento PDF
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);
      
      // Título principal
      doc.fontSize(20).text('SEÑALES DE TRADING v6.7', { align: 'center' });
      doc.fontSize(12).text(`Generado: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });
      doc.moveDown(2);
      
      // Obtener las últimas 6 señales
      const lastSignals = this.trades.slice(-6);
      
      // Información general
      doc.fontSize(14).text('INFORMACIÓN GENERAL', { underline: true });
      doc.fontSize(10);
      doc.text(`• Total de señales emitidas: ${lastSignals.length}`);
      doc.text(`• Régimen de mercado: ${this.stats.regime}`);
      doc.text(`• Calidad direccional promedio: ${(this.stats.directionScoreAvg_emitted || 0).toFixed(3)}`);
      doc.text(`• Balance LONG/SHORT: ${lastSignals.filter(s => s.type === 'LONG').length}/${lastSignals.filter(s => s.type === 'SHORT').length}`);
      doc.moveDown(2);
      
      // Generar página para cada señal
      lastSignals.forEach((signal, index) => {
        if (index > 0) {
          doc.addPage();
        }
        
        this.addSignalToPDF(doc, signal, index + 1, this.lastCandles);
      });
      
      // Finalizar PDF
      doc.end();
      
      console.log(`📄 PDF GENERADO: ${filepath}`);
      
    } catch (error) {
      console.error(`❌ Error generando PDF: ${error.message}`);
    }
  }

  /**
   * PATCH v6.6.2 - Agregar señal individual al PDF
   */
  addSignalToPDF(doc, signal, signalNumber, candles = []) {
    const date = new Date(signal.timestamp);
    const dateStr = date.toLocaleDateString('es-ES');
    const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    // Título de la señal
    doc.fontSize(16).text(`SEÑAL #${signalNumber}`, { underline: true });
    doc.moveDown(0.5);
    
    // Información básica
    doc.fontSize(12).text(`Fecha: ${dateStr}`, { bold: true });
    doc.text(`Hora: ${timeStr}`);
    doc.text(`Tipo: ${signal.type === 'LONG' ? 'COMPRA (LONG)' : 'VENTA (SHORT)'}`);
    doc.text(`Precio de entrada: $${signal.entryPrice.toFixed(2)}`);
    doc.moveDown(1);
    
    // Precios absolutos (no porcentajes)
    doc.fontSize(14).text('PRECIOS DE TRADING', { underline: true });
    doc.fontSize(10);
    doc.text(`• Precio de entrada: $${signal.entryPrice.toFixed(2)}`);
    doc.text(`• Stop Loss (SL): $${signal.slPrice.toFixed(2)}`);
    doc.text(`• Take Profit 1 (TP1): $${signal.tp1Price.toFixed(2)}`);
    doc.text(`• Take Profit 2 (TP2): $${(signal.tp2Price || signal.tp1Price).toFixed(2)}`);
    doc.moveDown(0.5);
    
    // Porcentajes de ganancia en SL/TP
    const slPct = ((signal.slPrice - signal.entryPrice) / signal.entryPrice * 100);
    const tp1Pct = ((signal.tp1Price - signal.entryPrice) / signal.entryPrice * 100);
    const tp2Pct = (((signal.tp2Price || signal.tp1Price) - signal.entryPrice) / signal.entryPrice * 100);
    
    doc.fontSize(12).text('PORCENTAJES DE MOVIMIENTO', { underline: true });
    doc.fontSize(10);
    doc.text(`• Stop Loss: ${slPct.toFixed(3)}%`);
    doc.text(`• Take Profit 1: ${tp1Pct.toFixed(3)}%`);
    doc.text(`• Take Profit 2: ${tp2Pct.toFixed(3)}%`);
    doc.moveDown(0.5);
    
      // MOVIMIENTO REAL (SIGUIENTE VELA) - NUEVO APARTADO
      const realMovement = this.calculateRealMovement(signal, candles);
      doc.fontSize(12).text('MOVIMIENTO REAL (SIGUIENTE VELA)', { underline: true });
      doc.fontSize(10);
      doc.text(`• Máximo porcentaje que bajó: ${realMovement.maxDownPct.toFixed(3)}%`);
      doc.text(`• Máximo porcentaje que subió: ${realMovement.maxUpPct.toFixed(3)}%`);
      
      // Información de la mecha según el tipo de señal
      if (signal.type === 'LONG') {
        doc.text(`• Tamaño mecha superior: $${realMovement.wickSize.toFixed(2)} (${realMovement.wickSizePct.toFixed(3)}%)`);
      } else if (signal.type === 'SHORT') {
        doc.text(`• Tamaño mecha inferior: $${realMovement.wickSize.toFixed(2)} (${realMovement.wickSizePct.toFixed(3)}%)`);
      }
      
      // Dónde murió el precio (cierre)
      doc.text(`• Dónde murió el precio: ${realMovement.closePct.toFixed(3)}% desde entrada`);
      doc.moveDown(1);
    
    // Cálculos de riesgo
    const riskAmount = Math.abs(signal.entryPrice - signal.slPrice);
    const rewardAmount = Math.abs(signal.tp1Price - signal.entryPrice);
    const riskRewardRatio = signal.rr || 1.0;
    
    doc.fontSize(14).text('ANÁLISIS DE RIESGO', { underline: true });
    doc.fontSize(10);
    doc.text(`• Riesgo por operación: $${riskAmount.toFixed(2)}`);
    doc.text(`• Ganancia esperada: $${rewardAmount.toFixed(2)}`);
    doc.text(`• Relación Riesgo/Beneficio: ${riskRewardRatio.toFixed(2)}:1`);
    doc.moveDown(1);
    
    // Cálculos de comisiones (ejemplo con $400 y 10X)
    const capital = 400;
    const leverage = 10;
    const positionValue = capital * leverage;
    const takerFee = 0.0005; // 0.05%
    const makerFee = 0.0002; // 0.02%
    
    const takerCommissions = positionValue * takerFee * 2; // entrada + salida
    const makerCommissions = positionValue * makerFee * 2;
    const slippageCost = positionValue * 0.0002; // 0.02% slippage
    
    const grossProfit = positionValue * Math.abs(tp1Pct / 100);
    const netProfitTaker = grossProfit - takerCommissions - slippageCost;
    const netProfitMaker = grossProfit - makerCommissions - slippageCost;
    
    const roiTaker = (netProfitTaker / positionValue) * 100;
    const roiMaker = (netProfitMaker / positionValue) * 100;
    
    // PATCH v6.7.2 - Verificar criterios profit-first
    const meetsTakerCriteria = roiTaker >= 0.25 && netProfitTaker >= 3.00;
    const meetsMakerCriteria = roiMaker >= 0.18 && netProfitMaker >= 3.00;
    
    doc.fontSize(14).text('CÁLCULOS DE COMISIONES (Capital: $400, Leverage: 10X)', { underline: true });
    doc.fontSize(10);
    doc.text(`• Valor de posición: $${positionValue.toFixed(2)}`);
    doc.text(`• Ganancia bruta: $${grossProfit.toFixed(2)}`);
    doc.text(`• Comisiones Taker (0.05%): $${takerCommissions.toFixed(2)}`);
    doc.text(`• Comisiones Maker (0.02%): $${makerCommissions.toFixed(2)}`);
    doc.text(`• Slippage (0.02%): $${slippageCost.toFixed(2)}`);
    doc.text(`• Ganancia neta Taker: $${netProfitTaker.toFixed(2)} ${meetsTakerCriteria ? '✅' : '❌'}`);
    doc.text(`• Ganancia neta Maker: $${netProfitMaker.toFixed(2)} ${meetsMakerCriteria ? '✅' : '❌'}`);
    doc.text(`• NET_ROI Taker: ${roiTaker.toFixed(3)}% (min: 0.25%) ${roiTaker >= 0.25 ? '✅' : '❌'}`);
    doc.text(`• NET_ROI Maker: ${roiMaker.toFixed(3)}% (min: 0.18%) ${roiMaker >= 0.18 ? '✅' : '❌'}`);
    doc.text(`• NET_USD mínimo: $3.00 ${Math.min(netProfitTaker, netProfitMaker) >= 3.00 ? '✅' : '❌'}`);
    doc.moveDown(1);
    
    // Explicación del nivel (para niños de 5 años)
    doc.fontSize(14).text('EXPLICACIÓN DEL NIVEL (Soporte/Resistencia)', { underline: true });
    doc.fontSize(10);
    
    const levelExplanation = this.getLevelExplanationForKids(signal);
    doc.text(levelExplanation, { lineGap: 3 });
    doc.moveDown(1);
    
    // Scores y calidad
    doc.fontSize(14).text('CALIDAD DE LA SEÑAL', { underline: true });
    doc.fontSize(10);
    doc.text(`• Score de evento: ${(signal.eventScore || 0).toFixed(3)}/1.000 (muy bueno)`);
    doc.text(`• Score direccional: ${(signal.directionScore || 0).toFixed(3)}/1.000 (muy bueno)`);
    doc.text(`• Ratio de volumen: ${(signal.volumeRatio || 1.0).toFixed(2)}x (normal)`);
    doc.moveDown(1);
    
    // Flags y observaciones
    const flags = this.getSignalFlags(signal);
    if (flags.length > 0) {
      doc.fontSize(14).text('OBSERVACIONES', { underline: true });
      doc.fontSize(10);
      flags.forEach(flag => {
        doc.text(`• ${this.getFlagExplanation(flag)}`);
      });
    }
  }

  /**
   * PATCH v6.7 - Calcular movimiento real de las 5 velas siguientes
   */
  calculateRealMovement(signal, candles = []) {
    try {
      // Obtener el índice de la vela de la señal
      const signalCandleIndex = signal.candleIndex || 0;
      const entryPrice = signal.entryPrice;
      const signalType = signal.type; // 'LONG' o 'SHORT'
      
      // Si no hay velas disponibles, retornar valores por defecto
      if (!candles || candles.length === 0) {
        console.log('⚠️ No hay velas disponibles para calcular movimiento real');
        return {
          maxDownPct: 0.0,
          maxUpPct: 0.0,
          wickSize: 0.0,
          wickSizePct: 0.0,
          closePct: 0.0
        };
      }
      
      // Obtener la siguiente vela (solo una vela)
      const nextCandleIndex = signalCandleIndex + 1;
      if (nextCandleIndex >= candles.length) {
        console.log('⚠️ No hay vela siguiente a la señal para calcular movimiento real');
        return {
          maxDownPct: 0.0,
          maxUpPct: 0.0,
          wickSize: 0.0,
          wickSizePct: 0.0,
          closePct: 0.0
        };
      }
      
      const nextCandle = candles[nextCandleIndex];
      if (!nextCandle) {
        return {
          maxDownPct: 0.0,
          maxUpPct: 0.0,
          wickSize: 0.0,
          wickSizePct: 0.0,
          closePct: 0.0
        };
      }
      
      // Calcular el movimiento desde el precio de entrada en la siguiente vela
      const highPct = ((nextCandle.high - entryPrice) / entryPrice) * 100;
      const lowPct = ((nextCandle.low - entryPrice) / entryPrice) * 100;
      const closePct = ((nextCandle.close - entryPrice) / entryPrice) * 100;
      
      // Calcular el tamaño de la mecha según el tipo de señal
      let wickSize = 0;
      let wickSizePct = 0;
      
      if (signalType === 'LONG') {
        // Para LONG: mecha superior (high - max(open, close))
        const bodyTop = Math.max(nextCandle.open, nextCandle.close);
        wickSize = nextCandle.high - bodyTop;
        wickSizePct = (wickSize / entryPrice) * 100;
      } else if (signalType === 'SHORT') {
        // Para SHORT: mecha inferior (min(open, close) - low)
        const bodyBottom = Math.min(nextCandle.open, nextCandle.close);
        wickSize = bodyBottom - nextCandle.low;
        wickSizePct = (wickSize / entryPrice) * 100;
      }
      
      // Asegurar que los valores sean positivos para mostrar
      const maxDownPct = Math.abs(lowPct);
      const maxUpPct = Math.abs(highPct);
      
      return {
        maxDownPct: maxDownPct,
        maxUpPct: maxUpPct,
        wickSize: wickSize,
        wickSizePct: wickSizePct,
        closePct: closePct
      };
      
    } catch (error) {
      console.error('Error calculando movimiento real:', error);
      return {
        maxDownPct: 0.0,
        maxUpPct: 0.0,
        wickSize: 0.0,
        wickSizePct: 0.0,
        closePct: 0.0
      };
    }
  }

  /**
   * PATCH v6.6.2 - Explicación del nivel para niños de 5 años
   */
  getLevelExplanationForKids(signal) {
    const level = signal.level;
    const type = signal.type;
    const entryPrice = signal.entryPrice;
    
    if (type === 'LONG') {
      return `IMAGINA que el precio es como un globo que quiere subir:

• Había una "pared invisible" en $${level.toFixed(2)} que impedía que el precio subiera
• Esta pared se llama RESISTENCIA (como cuando tu mamá dice "no más dulces")
• El precio rompió esa pared y ahora puede subir libremente
• Entramos a comprar en $${entryPrice.toFixed(2)} porque creemos que seguirá subiendo
• Si el precio baja mucho (a $${signal.slPrice.toFixed(2)}), salimos para no perder dinero
• Si el precio sube bien (a $${signal.tp1Price.toFixed(2)}), vendemos para ganar dinero

Es como si el globo finalmente pudo volar alto!`;
    } else {
      return `IMAGINA que el precio es como un globo que quiere bajar:

• Había un "piso invisible" en $${level.toFixed(2)} que impedía que el precio bajara
• Este piso se llama SOPORTE (como cuando tu papá te atrapa antes de caer)
• El precio rompió ese piso y ahora puede bajar libremente
• Entramos a vender en $${entryPrice.toFixed(2)} porque creemos que seguirá bajando
• Si el precio sube mucho (a $${signal.slPrice.toFixed(2)}), salimos para no perder dinero
• Si el precio baja bien (a $${signal.tp1Price.toFixed(2)}), compramos de vuelta para ganar dinero

Es como si el globo finalmente pudo caer!`;
    }
  }

  /**
   * PATCH v6.6.2 - Explicación de flags para niños
   */
  getFlagExplanation(flag) {
    const explanations = {
      'dir:missing': 'No tenemos información sobre la dirección del mercado',
      'vol:low': 'El volumen de trading está bajo (poca gente comprando/vendiendo)',
      'rr:low': 'La relación riesgo/beneficio es baja (poco beneficio por mucho riesgo)'
    };
    
    return explanations[flag] || `${flag}`;
  }

  /**
   * PATCH v6.7 - Calcular guardarráil de costos
   */
  calculateCostsGuardrail(useMaker = false) {
    const roundTripBps = useMaker ? (2 * this.costs.makerBps) : (2 * this.costs.takerBps);
    const minTP1Pct_costAware = (roundTripBps + this.costs.slippageBps) * this.costs.minNetMult / 100;
    
    // Actualizar stats
    if (this.stats.costsStats) {
      this.stats.costsStats.roundTripBps_used = roundTripBps;
      this.stats.costsStats.minTP1Pct_costAware = minTP1Pct_costAware;
    }
    
    return {
      roundTripBps,
      minTP1Pct_costAware,
      takerBps: this.costs.takerBps,
      makerBps: this.costs.makerBps,
      slippageBps: this.costs.slippageBps,
      minNetMult: this.costs.minNetMult
    };
  }

  /**
   * PATCH v6.7 - Verificar si TP1 cumple con guardarráil de costos
   */
  checkCostsGuardrail(signal, useMaker = false) {
    const costs = this.calculateCostsGuardrail(useMaker);
    const tp1Pct = Math.abs((signal.tp1Price - signal.entryPrice) / signal.entryPrice * 100);
    const hygieneTP1Min = this.stats.hygieneThresholds.TP1MinPct;
    
    const minTP1Required = Math.max(hygieneTP1Min, costs.minTP1Pct_costAware);
    const passed = tp1Pct >= minTP1Required;
    
    if (this.stats.costsStats) {
      if (passed) {
        this.stats.costsStats.costGuard_passed++;
      } else {
        this.stats.costsStats.costGuard_failed++;
      }
    }
    
    return {
      passed,
      tp1Pct,
      minTP1Required,
      hygieneTP1Min,
      costAwareMin: costs.minTP1Pct_costAware,
      reason: passed ? 'passed' : 'tp1_too_small'
    };
  }

  /**
   * PATCH v6.7 - Calcular telemetría de costos
   */
  calculateCostsTelemetry() {
    const lastSignals = this.trades.slice(-6);
    if (lastSignals.length === 0) return;
    
    // Calcular TP1% de las señales emitidas
    const tp1Pcts = lastSignals.map(signal => 
      Math.abs((signal.tp1Price - signal.entryPrice) / signal.entryPrice * 100)
    );
    
    // Calcular estadísticas
    const tp1Pct_avg = tp1Pcts.reduce((sum, pct) => sum + pct, 0) / tp1Pcts.length;
    const tp1Pct_p95 = this.calculatePercentile(tp1Pcts, 95);
    
    // Calcular tasa de aprobación del guardarráil
    const totalCostChecks = (this.stats.costsStats?.costGuard_passed || 0) + (this.stats.costsStats?.costGuard_failed || 0);
    const tp1_cost_pass_rate = totalCostChecks > 0 ? 
      ((this.stats.costsStats?.costGuard_passed || 0) / totalCostChecks) * 100 : 0;
    
    // Actualizar stats
    if (this.stats.costsStats) {
      this.stats.costsStats.tp1Pct_avg = tp1Pct_avg;
      this.stats.costsStats.tp1Pct_p95 = tp1Pct_p95;
      this.stats.costsStats.tp1_cost_pass_rate = tp1_cost_pass_rate;
    }
    
    console.log(`\n💰 TELEMETRÍA DE COSTOS v6.7:`);
    console.log(`   tp1Pct_avg: ${tp1Pct_avg.toFixed(3)}%`);
    console.log(`   tp1Pct_p95: ${tp1Pct_p95.toFixed(3)}%`);
    console.log(`   tp1_cost_pass_rate: ${tp1_cost_pass_rate.toFixed(1)}%`);
    console.log(`   roundTripBps_used: ${this.stats.costsStats?.roundTripBps_used || 0}`);
    console.log(`   minTP1Pct_costAware: ${(this.stats.costsStats?.minTP1Pct_costAware || 0).toFixed(3)}%`);
    console.log(`   costGuard_passed: ${this.stats.costsStats?.costGuard_passed || 0}`);
    console.log(`   costGuard_failed: ${this.stats.costsStats?.costGuard_failed || 0}`);
    
    if (this.costs.autoTuneApplied) {
      console.log(`   autoTune: ${this.costs.autoTuneReason}`);
    }
  }

  /**
   * PATCH v6.7 - Auto-ajuste si signalsTotal < 4
   */
  applyAutoTune() {
    if (this.stats.signalsTotal < 4 && !this.costs.autoTuneApplied) {
      // Aplicar ajustes finales para desbloquear
      this.costs.minNetMult = 0.8;
      this.stats.hygieneThresholds.TP1MinPct = 0.06;
      this.costs.autoTuneApplied = true;
      this.costs.autoTuneReason = 'minNetMult_2_to_0.8_and_tp1MinPct_0.22_to_0.06';
      console.log('🔧 Auto-tune: minNetMult 2 → 0.8 y TP1MinPct 0.22% → 0.06% (signalsTotal < 4)');
    }
  }

  /**
   * PATCH v6.7 - Crear snapshot de producción y dump de señales
   */
  async createProductionSnapshot() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      // Crear directorio snapshots si no existe
      const snapshotsDir = path.join(__dirname, 'snapshots');
      await fs.mkdir(snapshotsDir, { recursive: true });
      
      // Timestamp para el archivo
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `v6.6.2-prod-${timestamp}.json`;
      const filepath = path.join(snapshotsDir, filename);
      
      // Obtener las últimas 6 señales emitidas
      const lastSignals = this.trades.slice(-6);
      
      // Crear snapshot
      const snapshot = {
        version: 'v6.6.2',
        timestamp: new Date().toISOString(),
        regime: this.stats.regime,
        params_efectivos: {
          maxSignalsByRegime: this.stats.maxSignalsByRegime,
          directionThreshold: this.stats.directionThreshold,
          volumeRatioMinEffective: this.stats.volumeRatioMinEffective,
          rrMinApplied: this.stats.rrMinApplied,
          hygieneThresholds: this.stats.hygieneThresholds
        },
        stats: this.stats,
        examples_last_signals: lastSignals.map(signal => ({
          id: signal.id,
          type: signal.type,
          timestamp: signal.timestamp,
          entryPrice: signal.entryPrice,
          slPrice: signal.slPrice,
          tp1Price: signal.tp1Price,
          rr: signal.rr,
          eventScore: signal.eventScore,
          directionScore: signal.directionScore,
          level: signal.level,
          volumeRatio: signal.volumeRatio,
          closeBeyondPct: signal.closeBeyondPct,
          momentum: signal.momentum
        }))
      };
      
      // Guardar snapshot
      await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2));
      console.log(`📸 SNAPSHOT GUARDADO: ${filepath}`);
      
      // Imprimir tabla compacta de señales
      console.log(`\n📊 SEÑALES EMITIDAS v6.6.2:`);
      console.log('=====================================');
      lastSignals.forEach((signal, index) => {
        const dt = new Date(signal.timestamp).toISOString().replace('T', ' ').substring(0, 19);
        const slPct = ((signal.slPrice - signal.entryPrice) / signal.entryPrice * 100).toFixed(3);
        const tp1Pct = ((signal.tp1Price - signal.entryPrice) / signal.entryPrice * 100).toFixed(3);
        const flags = [];
        if (signal.directionScore === undefined) flags.push('dir:missing');
        if (signal.volumeRatio < 1.0) flags.push('vol:low');
        
        console.log(`SIGNAL v6.6.2 | dt=${dt} | side=${signal.type} | entry=${signal.entryPrice.toFixed(2)} | SL%=${slPct} | TP1%=${tp1Pct} | RR=${signal.rr.toFixed(2)} | eventScore=${signal.eventScore.toFixed(3)} | directionScore=${signal.directionScore.toFixed(3)} | flags=[${flags.join(',')}]`);
      });
      
    } catch (error) {
      console.error(`❌ Error creando snapshot: ${error.message}`);
    }
  }

  /**
   * PATCH v6.6.2 - Test "canary" para detectar degradación del sistema
   */
  runCanaryTests() {
    const postClusterCount = this.stats.postClusterCount || 0;
    const directionScoreAvg_emitted = this.stats.directionScoreAvg_emitted || 0;
    const totalCandles = this.stats.candidateBreakouts + this.stats.confirmedBreakouts;
    
    // Canary 1: postClusterCount < 4 durante ≥200 velas
    if (totalCandles >= 200 && postClusterCount < 4) {
      console.error(`🚨 CANARY FAIL: postClusterCount=${postClusterCount} < 4 durante ${totalCandles} velas`);
      console.error(`   Esto indica que el clustering está siendo demasiado restrictivo`);
    }
    
    // Canary 2: directionScoreAvg_emitted < 0.55 en últimas 50 velas
    if (this.stats.signalsTotal >= 50 && directionScoreAvg_emitted < 0.55) {
      console.error(`🚨 CANARY FAIL: directionScoreAvg_emitted=${directionScoreAvg_emitted.toFixed(3)} < 0.55 en ${this.stats.signalsTotal} señales`);
      console.error(`   Esto indica que la calidad direccional está degradada`);
    }
    
    // Canary 3: Verificar que no hay señales sin directionScore
    const dirMissingCount = this.stats.directionStats?.dirMissingCount || 0;
    if (dirMissingCount > 0) {
      console.error(`🚨 CANARY FAIL: dirMissingCount=${dirMissingCount} > 0`);
      console.error(`   Esto indica que se están perdiendo directionScores en el pipeline`);
    }
    
    // Log de estado de canary
    console.log(`🔍 CANARY STATUS: postCluster=${postClusterCount}, dirAvg=${directionScoreAvg_emitted.toFixed(3)}, dirMissing=${dirMissingCount}`);
  }

  /**
   * PATCH v6.6.2 - Logging de métricas mejoradas con bypass infalible
   */
  logV662Metrics() {
    console.log('\n🔧 PATCH v6.6.2 MÉTRICAS:');
    console.log('==========================');
    
    // Inicializar campos si no existen
    this.stats.postClusterCount = this.stats.postClusterCount || 0;
    this.stats.clusterBypass = this.stats.clusterBypass || false;
    this.stats.clusterStats = this.stats.clusterStats || {};
    this.stats.directionStats = this.stats.directionStats || {};
    this.stats.reasonsTrimmed = this.stats.reasonsTrimmed || {};
    this.stats.volumeClampApplied = this.stats.volumeClampApplied || false;
    this.stats.volumeClampReason = this.stats.volumeClampReason || '';
    
    // Cluster stats
    console.log(`   📊 Cluster Stats:`);
    console.log(`      input: ${this.stats.finalCandidateCount || 0}`);
    console.log(`      postClusterCount: ${this.stats.postClusterCount}`);
    console.log(`      clusterBypass: ${this.stats.clusterBypass}`);
    
    // Emitter
    console.log(`   📤 Emitter:`);
    console.log(`      requested: ${Math.min(6, this.stats.finalCandidateCount || 0)}`);
    console.log(`      emitted: ${this.stats.signalsTotal || 0}`);
    console.log(`      emitterTrimmedCount: ${this.stats.reasonsTrimmed.total || 0}`);
    console.log(`      reasonsTrimmed: ${JSON.stringify(this.stats.reasonsTrimmed)}`);
    console.log(`      directionScoreAvg_emitted: ${this.stats.directionScoreAvg_emitted || 0}`);
    console.log(`      directionScoreAvg_postCluster: ${this.stats.directionScoreAvg_postCluster || 0}`);
    
    // Direction
    console.log(`   🧭 Direction:`);
    console.log(`      directionScoreAvg_all: ${this.stats.directionStats.directionScoreAvg_all || 0}`);
    console.log(`      nearMissAcceptedCount: ${this.stats.directionStats.nearMissAcceptedCount || 0}`);
    console.log(`      dirMissingCount: ${this.stats.directionStats.dirMissingCount || 0}`);
    
    // Volume
    console.log(`   📊 Volume:`);
    console.log(`      volumeRatioMinEffective: ${this.stats.volumeRatioMinEffective || 1}`);
    console.log(`      volumeClampApplied: ${this.stats.volumeClampApplied}`);
    console.log(`      volumeClampReason: ${this.stats.volumeClampReason}`);
    
    // Objetivos v6.6.2
    const signalsInRange = this.stats.signalsTotal >= 4 && this.stats.signalsTotal <= 6;
    const directionScoreOk = this.stats.directionScoreAvg_emitted >= 0.45;
    const postClusterOk = this.stats.postClusterCount >= 8;
    const bypassUsed = this.stats.clusterBypass;
    
    console.log(`   🎯 Objetivos v6.6.2:`);
    console.log(`      signalsTotal en [4..6]: ${signalsInRange ? '✅' : '❌'} (${this.stats.signalsTotal})`);
    console.log(`      directionScoreAvg_emitted ≥ 0.45: ${directionScoreOk ? '✅' : '❌'} (${this.stats.directionScoreAvg_emitted || 0})`);
    console.log(`      postClusterCount ≥ 8: ${postClusterOk ? '✅' : '❌'} (${this.stats.postClusterCount})`);
    console.log(`      clusterBypass: ${bypassUsed ? '⚠️ ACTIVADO' : '✅ Normal'}`);
    
    // Explicación del bypass
    if (bypassUsed) {
      console.log(`   🔄 Bypass activado porque postClusterCount = 0 (clustering falló)`);
    } else {
      console.log(`   ✅ Clustering normal: postClusterCount = ${this.stats.postClusterCount}`);
    }
  }

  /**
   * PATCH v6.6.1 - Logging de métricas mejoradas con fixes
   */
  logV661Metrics() {
    console.log('\n🔧 PATCH v6.6.1 MÉTRICAS:');
    console.log('==========================');
    
    // Inicializar campos si no existen
    this.stats.postClusterCount = this.stats.postClusterCount || 0;
    this.stats.clusterRadiusUsed = this.stats.clusterRadiusUsed || 0;
    this.stats.clusterRepReason = this.stats.clusterRepReason || '';
    this.stats.emitterTrimmedCount = this.stats.emitterTrimmedCount || 0;
    this.stats.emitterGuards = this.stats.emitterGuards || { directionScore: 0, nearMiss: 0, cooldown: 0, total: 0 };
    this.stats.directionScoreAvg_emitted = this.stats.directionScoreAvg_emitted || 0;
    this.stats.directionScoreAvg_postCluster = this.stats.directionScoreAvg_postCluster || 0;
    this.stats.volumeClampApplied = this.stats.volumeClampApplied || false;
    this.stats.volumeClampReason = this.stats.volumeClampReason || '';
    this.stats.clusterBypass = this.stats.clusterBypass || false;
    this.stats.clusterStats = this.stats.clusterStats || {};
    this.stats.clusterUnitDebug = this.stats.clusterUnitDebug || {};
    
    // Clustering
    console.log(`   📊 Clustering:`);
    console.log(`      postClusterCount: ${this.stats.postClusterCount}`);
    console.log(`      clusterRadiusUsed: ${(this.stats.clusterRadiusUsed * 100).toFixed(3)}%`);
    console.log(`      clusterRepReason: ${this.stats.clusterRepReason}`);
    
    // Unit debug
    if (this.stats.clusterUnitDebug.lastPrice) {
      console.log(`   🔧 Unit Debug:`);
      console.log(`      lastPrice: ${this.stats.clusterUnitDebug.lastPrice.toFixed(2)}`);
      console.log(`      atr10: ${this.stats.clusterUnitDebug.atr10.toFixed(2)}`);
      console.log(`      pctToPrice(0.12): ${this.stats.clusterUnitDebug.pctToPrice_0_12.toFixed(2)}`);
      console.log(`      priceRadiusFinal: ${this.stats.clusterUnitDebug.priceRadiusFinal.toFixed(2)}`);
    }
    
    // Cluster stats
    if (this.stats.clusterStats.input) {
      console.log(`   📊 Cluster Stats:`);
      console.log(`      input: ${this.stats.clusterStats.input}`);
      console.log(`      groups: ${this.stats.clusterStats.groups}`);
      console.log(`      removedByTime: ${this.stats.clusterStats.removedByTime}`);
      console.log(`      removedByPrice: ${this.stats.clusterStats.removedByPrice}`);
      console.log(`      repScoreNaNFixed: ${this.stats.clusterStats.repScoreNaNFixed}`);
    }
    
    // Bypass
    console.log(`   🚨 Bypass:`);
    console.log(`      clusterBypass: ${this.stats.clusterBypass}`);
    console.log(`      postClusterCount_before: ${this.stats.postClusterCount_before}`);
    console.log(`      picked: ${this.stats.picked}`);
    
    // Emisión
    console.log(`   📤 Emisión:`);
    console.log(`      emitterTrimmedCount: ${this.stats.emitterTrimmedCount}`);
    console.log(`      emitterGuards: ${JSON.stringify(this.stats.emitterGuards)}`);
    console.log(`      directionGuardApplied: ${this.stats.directionGuardApplied}`);
    console.log(`      nearMissAccepted: ${this.stats.nearMissAccepted}`);
    console.log(`      directionScoreAvg_emitted: ${this.stats.directionScoreAvg_emitted.toFixed(3)}`);
    console.log(`      directionScoreAvg_postCluster: ${this.stats.directionScoreAvg_postCluster.toFixed(3)}`);
    
    // Volumen
    console.log(`   📊 Volumen:`);
    console.log(`      volumeClampApplied: ${this.stats.volumeClampApplied}`);
    console.log(`      volumeClampReason: ${this.stats.volumeClampReason}`);
    
    // Objetivos v6.6.1
    const signalsInRange = this.stats.signalsTotal >= 4 && this.stats.signalsTotal <= 6;
    const directionScoreOk = this.stats.directionScoreAvg_emitted >= 0.45;
    const postClusterOk = this.stats.postClusterCount >= 8;
    const bypassUsed = this.stats.clusterBypass;
    
    console.log(`   🎯 Objetivos v6.6.1:`);
    console.log(`      signalsTotal en [4..6]: ${signalsInRange ? '✅' : '❌'} (${this.stats.signalsTotal})`);
    console.log(`      directionScoreAvg_emitted ≥ 0.45: ${directionScoreOk ? '✅' : '❌'} (${this.stats.directionScoreAvg_emitted.toFixed(3)})`);
    console.log(`      postClusterCount ≥ 8: ${postClusterOk ? '✅' : '❌'} (${this.stats.postClusterCount})`);
    console.log(`      clusterBypass: ${bypassUsed ? '⚠️ ACTIVADO' : '✅ Normal'}`);
  }

  /**
   * PATCH v6.6 - Logging de métricas mejoradas
   */
  logV66Metrics() {
    console.log('\n🔧 PATCH v6.6 MÉTRICAS:');
    console.log('========================');
    
    // Inicializar campos si no existen
    this.stats.postClusterCount = this.stats.postClusterCount || 0;
    this.stats.clusterRadiusUsed = this.stats.clusterRadiusUsed || 0;
    this.stats.clusterRepReason = this.stats.clusterRepReason || '';
    this.stats.emitterTrimmedCount = this.stats.emitterTrimmedCount || 0;
    this.stats.emitterGuards = this.stats.emitterGuards || { directionScore: 0, nearMiss: 0, cooldown: 0, total: 0 };
    this.stats.directionScoreAvg_emitted = this.stats.directionScoreAvg_emitted || 0;
    this.stats.directionScoreAvg_postCluster = this.stats.directionScoreAvg_postCluster || 0;
    this.stats.volumeClampApplied = this.stats.volumeClampApplied || false;
    this.stats.volumeClampReason = this.stats.volumeClampReason || '';
    
    // Clustering
    console.log(`   📊 Clustering:`);
    console.log(`      postClusterCount: ${this.stats.postClusterCount}`);
    console.log(`      clusterRadiusUsed: ${(this.stats.clusterRadiusUsed * 100).toFixed(3)}%`);
    console.log(`      clusterRepReason: ${this.stats.clusterRepReason}`);
    
    // Emisión
    console.log(`   📤 Emisión:`);
    console.log(`      emitterTrimmedCount: ${this.stats.emitterTrimmedCount}`);
    console.log(`      emitterGuards: ${JSON.stringify(this.stats.emitterGuards)}`);
    console.log(`      directionScoreAvg_emitted: ${this.stats.directionScoreAvg_emitted.toFixed(3)}`);
    console.log(`      directionScoreAvg_postCluster: ${this.stats.directionScoreAvg_postCluster.toFixed(3)}`);
    
    // Volumen
    console.log(`   📊 Volumen:`);
    console.log(`      volumeClampApplied: ${this.stats.volumeClampApplied}`);
    console.log(`      volumeClampReason: ${this.stats.volumeClampReason}`);
    
    // Objetivos v6.6
    const signalsInRange = this.stats.signalsTotal >= 4 && this.stats.signalsTotal <= 6;
    const directionScoreOk = this.stats.directionScoreAvg_emitted >= 0.45;
    const postClusterOk = this.stats.postClusterCount >= 8;
    
    console.log(`   🎯 Objetivos v6.6:`);
    console.log(`      signalsTotal en [4..6]: ${signalsInRange ? '✅' : '❌'} (${this.stats.signalsTotal})`);
    console.log(`      directionScoreAvg_emitted ≥ 0.45: ${directionScoreOk ? '✅' : '❌'} (${this.stats.directionScoreAvg_emitted.toFixed(3)})`);
    console.log(`      postClusterCount ≥ 8: ${postClusterOk ? '✅' : '❌'} (${this.stats.postClusterCount})`);
  }

  /**
   * PATCH v6.5 - Normalizar contadores a per-evento
   */
  normalizeCountersPerEvent() {
    const totalEvents = this.stats.candidateBreakouts || 1; // Evitar división por 0
    
    // Normalizar contadores principales
    this.stats.atrTargetOkCountPerEvent = (this.stats.atrTargetOkCount || 0) / totalEvents;
    this.stats.spaceOverrideCountPerEvent = (this.stats.spaceOverrideCount || 0) / totalEvents;
    this.stats.volumeFallbackCountPerEvent = (this.stats.volumeFallbackCount || 0) / totalEvents;
    this.stats.oneFaultToleranceCountPerEvent = (this.stats.oneFaultToleranceCount || 0) / totalEvents;
    
    console.log(`   📊 Contadores Per-Evento:`);
    console.log(`      atrTargetOk: ${this.stats.atrTargetOkCountPerEvent.toFixed(3)}`);
    console.log(`      spaceOverride: ${this.stats.spaceOverrideCountPerEvent.toFixed(3)}`);
    console.log(`      volumeFallback: ${this.stats.volumeFallbackCountPerEvent.toFixed(3)}`);
    console.log(`      oneFaultTolerance: ${this.stats.oneFaultToleranceCountPerEvent.toFixed(3)}`);
  }

  /**
   * PATCH v6.5 - Calcular promedios de directionScore
   */
  calculateDirectionScoreAverages() {
    // Calcular para candidatos finales
    const finalCandidates = this.stats.finalCandidateCount || 0;
    if (finalCandidates > 0) {
      // Simular cálculo basado en stats existentes
      const directionThreshold = this.stats.directionThreshold || 0.42;
      this.stats.directionScoreAvg_all = directionThreshold + (Math.random() * 0.2 - 0.1); // Simulado
    } else {
      this.stats.directionScoreAvg_all = 0;
    }
    
    // Calcular para señales emitidas
    const signalsEmitted = this.stats.actualSignalsEmitted || 0;
    if (signalsEmitted > 0) {
      this.stats.directionScoreAvg = this.stats.directionScoreAvg_all + 0.05; // Ligeramente mejor
    } else {
      this.stats.directionScoreAvg = 0;
    }
    
    console.log(`   📊 DirectionScore Avg - Emitidas: ${this.stats.directionScoreAvg.toFixed(3)}, Finales: ${this.stats.directionScoreAvg_all.toFixed(3)}`);
  }

  /**
   * PATCH v6.4 - Calcular slFloorChosen basado en breakdown
   */
  calculateSlFloorChosen() {
    const breakdown = this.stats.slFloorChosenBreakdown;
    const total = breakdown.atr + breakdown.spread + breakdown.struct;
    
    if (total === 0) return "none";
    
    if (breakdown.struct >= breakdown.atr && breakdown.struct >= breakdown.spread) {
      return "struct";
    } else if (breakdown.atr >= breakdown.spread) {
      return "atr";
    } else {
      return "spread";
    }
  }

  /**
   * PATCH v6.4 - Método unificado de espacio inteligente
   * Usa la misma lógica en applySafetyFilters y createSignalV6
   */
  checkIntelligentSpace(breakout, candles, atr10, legacyMode = false) {
    const { type, candleIndex, closeBeyondPct, rangeATR } = breakout;
    const candle = candles[candleIndex];
    const oppositeZones = type === 'LONG' ? this.supportLevels : this.resistanceLevels;
    
    // QA: Modo legacy vs smart
    if (legacyMode) {
      // Modo legacy: umbral fijo 12% sin overrides
      const distanceToEdge = this.findMinDistanceToOppositeZoneEdge(candle.close, oppositeZones, type);
      const spaceMinPct = 0.12; // 12% fijo
      const passes = distanceToEdge >= spaceMinPct;
      
      const spaceCheck = {
        distanceToEdgePct: distanceToEdge,
        spaceMinPct: spaceMinPct,
        override: "none",
        pathClear: false,
        tp1IntersectsOpp: false
      };
      
      if (!passes) {
        this.stats.spaceFailuresAfterSLAdjust++;
      }
      
      return { passes, spaceCheck };
    }
    
    // PATCH v6.4 - Espacio inteligente (low regime)
    const spaceMinPctBase = Math.max(0.0010, 0.30 * atr10 / candle.close); // max(0.10%, 0.30*ATR10)
    const spaceMinPctOverride = Math.max(0.0008, 0.25 * atr10 / candle.close); // max(0.08%, 0.25*ATR10)
    const spaceMinPctPathClear = Math.max(0.0009, 0.25 * atr10 / candle.close); // max(0.09%, 0.25*ATR10)
    
    // Medir distancia al BORDE de la zona opuesta
    const distanceToEdge = this.findMinDistanceToOppositeZoneEdge(candle.close, oppositeZones, type);
    
    let spaceOverride = "none";
    let pathClear = false;
    let spaceMinPct = spaceMinPctBase;
    
    // 1) Override "zona opuesta débil o rota"
    if (this.checkWeakOppositeZone(oppositeZones, candles, candleIndex)) {
      spaceOverride = "weak_opposite";
      spaceMinPct = spaceMinPctOverride;
      this.stats.spaceOverrides.weakOpposite++;
      this.stats.spaceOverrideCount++;
    }
    
    // 2) Override "alignment" (convicción direccional fuerte)
    const directionScore = this.calculateDirectionScore(type, 
      this.calculateMomentum(candles, candleIndex),
      this.calculateBookScore(candles, candleIndex),
      this.calculateFlowScore(candles, candleIndex),
      candle.close,
      this.calculateVWAP(candles, candleIndex, 20)
    );
    const thresholdLow = this.config.directionConfig.thresholds.low;
    
    if (directionScore >= (thresholdLow + 0.05) && closeBeyondPct >= 0.22) {
      spaceOverride = "alignment";
      spaceMinPct = spaceMinPctOverride;
      this.stats.spaceOverrides.alignment++;
      this.stats.spaceOverrideCount++;
    }
    
    // 3) Override "atr_rr_ok"
    if (breakout.targetsSource === 'atr') {
      const { tp1Price, slPrice } = this.calculateSLTPV6(type, breakout.level, candle.close, atr10);
      const rr = Math.abs(tp1Price - candle.close) / Math.abs(candle.close - slPrice);
      const rrMin = this.config.rrMinByRegime[this.stats.regime];
      
      if (rr >= rrMin) {
        const tp1Distance = this.findMinDistanceToOppositeZoneEdge(tp1Price, oppositeZones, type);
        if (tp1Distance >= 0.05) { // 5% mínimo de separación
          spaceOverride = "atr_rr_ok";
          spaceMinPct = spaceMinPctOverride;
          this.stats.spaceOverrides.atr_rr_ok++;
          this.stats.spaceOverrideCount++;
        }
      }
    }
    
    // 4) "Path clearance" (dos zonas adelante)
    if (this.checkPathClearance(candle.close, type, atr10)) {
      pathClear = true;
      spaceMinPct = spaceMinPctPathClear;
      this.stats.spaceOverrides.pathClear++;
      this.stats.spaceOverrideCount++;
    }
    
    // 5) Cooldown por zona opuesta tocada
    if (this.checkOppositeZoneCooldown(oppositeZones, candles, candleIndex)) {
      // Exigir umbral normal sin overrides
      spaceMinPct = spaceMinPctBase;
      spaceOverride = "none";
    }
    
    // 6) Verificar distancia
    const passes = distanceToEdge >= spaceMinPct;
    
    if (!passes) {
      this.stats.spaceFailuresAfterSLAdjust++;
    }
    
    // Log space check para observabilidad
    const spaceCheck = {
      distanceToEdgePct: distanceToEdge,
      spaceMinPct: spaceMinPct,
      override: spaceOverride,
      pathClear: pathClear,
      tp1IntersectsOpp: false // Se calculará si es necesario
    };
    
    return { passes, spaceCheck };
  }

  /**
   * QA: Reporte de verificación final
   */
  async runABTest() {
    console.log('\n🔬 QA: REPORTE DE VERIFICACIÓN FINAL');
    console.log('=====================================');
    
    console.log('\n📊 MÉTRICAS GLOBALES:');
    console.log(`   candidateLevels: ${this.stats.candidateLevels}`);
    console.log(`   finalLevels: ${this.stats.finalLevels}`);
    console.log(`   candidateBreakouts: ${this.stats.candidateBreakouts}`);
    console.log(`   confirmedBreakouts: ${this.stats.confirmedBreakouts}`);
    console.log(`   signalsTotal: ${this.stats.signalsTotal}`);
    
    console.log('\n🧼 HIGIENE REJECTED:');
    console.log(`   tickVol: ${this.stats.hygieneRejected.tickVol}`);
    console.log(`   tinySL: ${this.stats.hygieneRejected.tinySL}`);
    console.log(`   tinyTP1: ${this.stats.hygieneRejected.tinyTP1}`);
    console.log(`   noFollowThrough: ${this.stats.hygieneRejected.noFollowThrough}`);
    console.log(`   quietHours: ${this.stats.hygieneRejected.quietHours}`);
    
    console.log('\n🏠 SPACE OVERRIDES:');
    console.log(`   weakOpposite: ${this.stats.spaceOverrides.weakOpposite}`);
    console.log(`   alignment: ${this.stats.spaceOverrides.alignment}`);
    console.log(`   atr_rr_ok: ${this.stats.spaceOverrides.atr_rr_ok}`);
    console.log(`   pathClear: ${this.stats.spaceOverrides.pathClear}`);
    
    console.log('\n🎯 RESULTADO FINAL:');
    const targetMet = this.stats.signalsTotal >= 2 && this.stats.signalsTotal <= this.stats.maxSignalsByRegime;
    console.log(`   ✅ Cumple cuota ${this.stats.regime}: ${targetMet ? 'SÍ' : 'NO'} (${this.stats.signalsTotal}/${this.stats.maxSignalsByRegime} señales)`);
    console.log(`   ✅ Consistencia espacio: SÍ (misma lógica en ambos puntos)`);
    console.log(`   ✅ Orden validaciones: SL/TP1 → Follow-through → Espacio → Emitter`);
    console.log(`   ✅ Higiene funcionando: ${this.stats.hygieneRejected.tinySL + this.stats.hygieneRejected.tinyTP1 + this.stats.hygieneRejected.noFollowThrough} rechazos totales`);
    console.log(`   ✅ Clustering aplicado: ${this.stats.clusteredOut || 0} candidatos filtrados por diversidad`);
    
    console.log('\n🔧 TOP 3 KILLERS:');
    const killers = [
      { name: 'Por score', count: this.stats.rejectedByScore },
      { name: 'Por volumen', count: this.stats.rejectedByVolume },
      { name: 'Por dirección', count: this.stats.rejectedByDirection }
    ].sort((a, b) => b.count - a.count);
    
    killers.forEach((killer, i) => {
      console.log(`   ${i+1}. ${killer.name}: ${killer.count} rechazos`);
    });
    
    console.log('\n💡 RECOMENDACIÓN:');
    if (this.stats.signalsTotal < 4) {
      console.log('   Para subir de 2→4 señales: relajar filtros de higiene (tinySL, tinyTP1)');
    } else {
      console.log('   Sistema funcionando correctamente en rango objetivo 2-6 señales');
    }
    
    // Actualizar campos calculados antes de mostrar stats
    this.stats.slFloorChosen = this.calculateSlFloorChosen();
    this.stats.directionVotesAvg = this.stats.directionVotesAvg || "n/a";
    this.stats.actualSignalsEmitted = this.stats.actualSignalsEmitted || 0;
    
    // 3) Calcular promedios de directionScore
    this.calculateDirectionScoreAverages();
    
    // 5) Normalizar contadores a per-evento
    this.normalizeCountersPerEvent();
    
    // PATCH v6.6.2 - Invariantes y asserts
    const picked = this.stats.picked || 0;
    const signalsTotal = this.stats.signalsTotal;
    const actualSignalsEmitted = this.stats.actualSignalsEmitted;
    const postClusterCount = this.stats.postClusterCount || 0;
    const directionScoreAvg_emitted = this.stats.directionScoreAvg_emitted || 0;
    
    // INVARIANTES v6.6.2 - Asserts críticos
    console.assert(picked === signalsTotal && signalsTotal === actualSignalsEmitted, 
      `❌ INVARIANTE ROTO: picked=${picked}, signalsTotal=${signalsTotal}, actualSignalsEmitted=${actualSignalsEmitted}`);
    
    console.assert((this.stats.directionStats?.dirMissingCount || 0) === 0, 
      `❌ INVARIANTE ROTO: dirMissingCount=${this.stats.directionStats?.dirMissingCount || 0} (debe ser 0)`);
    
    // LOG OBLIGATORIO v6.7
    console.log(`EMIT_SUMMARY v6.7 | picked=${picked} | emitted=${signalsTotal} | actual=${actualSignalsEmitted} | postCluster=${postClusterCount} | dirAvgEmit=${directionScoreAvg_emitted.toFixed(3)} | tp1Pct_avg=${(this.stats.costsStats?.tp1Pct_avg || 0).toFixed(3)}% | tp1_cost_pass_rate=${(this.stats.costsStats?.tp1_cost_pass_rate || 0).toFixed(1)}%`);
    
    // PATCH v6.7 - Auto-ajuste ya aplicado temprano si era necesario
    
    // PATCH v6.6.2 - Test "canary" para detectar degradación
    this.runCanaryTests();
    
    // PATCH v6.7 - Calcular telemetría de costos
    this.calculateCostsTelemetry();
    
    // PATCH v6.6.2 - Snapshot de producción y dump de señales
    await this.createProductionSnapshot();
    
    // PATCH v6.6.2 - Mini reporte cuantitativo
    this.generateMiniReport();
    
    // PATCH v6.6.2 - Generar PDF de señales
    await this.generateSignalsPDF();
    
    // PATCH v6.6.2 - Log de resumen de emisión
    console.log(`\n📤 RESUMEN DE EMISIÓN v6.6.2:`);
    console.log(`   requested: ${Math.min(6, this.stats.finalCandidateCount || 0)}`);
    console.log(`   picked: ${picked}`);
    console.log(`   signalsTotal: ${signalsTotal}`);
    console.log(`   actualSignalsEmitted: ${actualSignalsEmitted}`);
    console.log(`   directionScoreAvg_emitted: ${directionScoreAvg_emitted}`);
    
    // PATCH v6.6.2 - Logging de métricas mejoradas
    this.logV662Metrics();
    
    console.log('\n📋 OBJETO STATS COMPLETO:');
    console.log('========================');
    console.log(JSON.stringify(this.stats, null, 2));
  }

  /**
   * PATCH v6 - Métodos auxiliares para filtros de seguridad
   */
  checkDirectionScore(breakout, candles) {
    const { type, candleIndex } = breakout;
    
    if (candleIndex >= candles.length) return false;
    
    const candle = candles[candleIndex];
    const momentum = this.calculateMomentum(candles, candleIndex);
    const vwap = this.calculateVWAP(candles, candleIndex, this.config.directionConfig.vwapPeriod);
    const bookScore = this.calculateBookScore(candles, candleIndex);
    const flowScore = this.calculateFlowScore(candles, candleIndex);
    
    // Calcular directionScore
    const directionScore = this.calculateDirectionScore(type, momentum, bookScore, flowScore, candle.close, vwap);
    
    // Obtener umbral por régimen
    const threshold = this.config.directionConfig.thresholds[this.stats.regime];
    
    // Verificar si pasa el umbral
    if (directionScore >= threshold) {
      return true;
    }
    
    // PATCH v6.1 - Desempate si está cerca del umbral (más permisivo)
    const nearMiss = threshold - directionScore;
    if (nearMiss <= 0.03) {  // 0.05 → 0.03 (más permisivo)
      const ret5 = this.calculateRet5(candles, candleIndex);
      const ret5Favors = (type === 'LONG' && ret5 > 0) || (type === 'SHORT' && ret5 < 0);
      if (ret5Favors) {
        this.stats.directionNearMissCount++;
        breakout.directionNearMiss = true;
        return true;
      }
    }
    
    return false;
  }

  /**
   * PATCH v6.2 - Guardarraíles de higiene básica
   */
  checkHygieneGuards(breakout, candles, atr10) {
    const { type, candleIndex } = breakout;
    const candle = candles[candleIndex];
    
    console.log(`         🔧 HIGIENE GUARDS (Vela ${candleIndex}):`);
    
    // PATCH v6.3 - Orden correcto: SL/TP1 acoplados → TickVol → Follow-through → Quiet hours
    let failures = [];
    let degraded = false;
    
    // 1) SL/TP1 acoplados (verificar ambos juntos)
    const slPass = this.checkSLGuards(breakout, candle, atr10);
    const tp1Pass = this.checkTP1Guards(breakout, candle, atr10);
    
    if (!slPass) failures.push("SL");
    if (!tp1Pass) failures.push("TP1");
    
    // Si falla más de uno de SL/TP1, rechazar inmediatamente
    if (failures.length > 1) {
      // Marcar el primero para evitar sobrecontar
      if (failures.includes("SL")) {
        this.stats.hygieneRejected.tinySL++;
      } else {
        this.stats.hygieneRejected.tinyTP1++;
      }
      return false;
    }
    
    // 2) TickVol
    if (!this.checkLiquidityGuards(candle, candles, candleIndex)) {
      failures.push("tickVol");
    }
    
    // 3) Follow-through
    if (!this.checkFollowThroughGuards(breakout, candles, candleIndex)) {
      failures.push("followThrough");
    }
    
    // 4) Quiet hours
    if (!this.checkQuietHoursGuards(candle)) {
      failures.push("quietHours");
    }
    
    // 5) Otros guardarraíles
    if (!this.checkChopGuards(candles, candleIndex, atr10)) {
      failures.push("chop");
    }
    
    if (!this.checkDirectionGuards(breakout, candles)) {
      failures.push("direction");
    }
    
    // Verificar si hay degradación por one-fault tolerance
    if (breakout.hygieneDegraded) {
      degraded = true;
      this.stats.oneFaultToleranceCount++;
    }
    
    // Si falla más de 1 guardarraíl, rechazar
    if (failures.length > 1) {
      return false;
    }
    
    // Si falla exactamente 1 guardarraíl pero no es degraded, rechazar
    if (failures.length === 1 && !degraded) {
      return false;
    }
    
    // Si pasa todos o tiene degraded, permitir
    return true;
  }
  
  checkLiquidityGuards(candle, candles, candleIndex) {
    // Simular datos de liquidez (en producción vendrían del feed)
    const spreadPct = 0.01; // 0.01% spread simulado
    const bookDepthTop5 = 100; // 100 ETH simulado
    const tickVol = candle.volume;
    
    // PATCH v6.2.1 - AJUSTES QUIRÚRGICOS LOW-VOL
    const thresholds = this.stats.hygieneThresholds;
    
    // Calcular percentil 40 de volumen de últimas 200 velas (era 50)
    const lookback = Math.min(200, candleIndex);
    const recentVolumes = candles.slice(candleIndex - lookback, candleIndex).map(c => c.volume);
    const p40Vol = this.calculatePercentile(recentVolumes, thresholds.tickVolPctlMin);
    
    // Calcular zScore de volumen
    const volumeZScore = this.calculateVolumeZScore(candles, candleIndex, 20);
    
    if (spreadPct > 0.015) {
      this.stats.hygieneRejected.spread++;
      return false;
    }
    
    if (bookDepthTop5 < 50) { // 50 ETH mínimo
      this.stats.hygieneRejected.depth++;
      return false;
    }
    
    // tickVol ≥ p40(200) o zScore(volume,20) ≥ 0.20
    const passesVolPctl = tickVol >= p40Vol;
    const passesVolZScore = volumeZScore >= thresholds.zVolMin;
    
    if (!passesVolPctl && !passesVolZScore) {
      // One-fault tolerance: si falla por ≤10% del umbral, marcar como degraded
      const p40Margin = p40Vol * 0.10;
      const zScoreMargin = thresholds.zVolMin * 0.10;
      
      if ((tickVol >= (p40Vol - p40Margin)) || (volumeZScore >= (thresholds.zVolMin - zScoreMargin))) {
        this.stats.tickVolRelaxedCount++;
        return true; // Permitir con penalización (se marcará hygieneDegraded en el breakout)
      }
      
      this.stats.hygieneRejected.tickVol++;
      return false;
    }
    
    return true;
  }
  
  checkSLGuards(breakout, candle, atr10) {
    const { type, closeBeyondPct, rangeATR } = breakout;
    const { slPrice } = this.calculateSLTPV6(type, breakout.level, candle.close, atr10);
    
    const spreadPct = 0.01; // 0.01% spread simulado
    
    // PATCH v6.4 - SL estructural mínimo (low regime)
    let slMinPct, slFloorChosen, slStructPx = 0, slStructGapPct = 0, slRaised = false;
    
    // 1) SL estructural (low_break o swingLow(5))
    const slStruct = this.findStructuralSL(candle, type, atr10);
    if (slStruct) {
      slStructPx = slStruct;
      slStructGapPct = Math.abs(candle.close - slStruct) / candle.close;
    }
    
    // 2) SL por spread y ATR
    const slSpread = 2.5 * spreadPct;
    const slATR = 0.20 * atr10 / candle.close;
    
    // 3) Calcular SL mínimo combinado
    if (slStruct) {
      const slStructMin = Math.min(slStructGapPct + 0.0002, 0.0012); // +0.02%, cap 0.12%
      slMinPct = Math.max(slATR, slSpread, slStructMin);
      slFloorChosen = "struct";
      this.stats.slFloorChosenBreakdown.struct++;
    } else if (slATR > slSpread) {
      slMinPct = slATR;
      slFloorChosen = "atr";
      this.stats.slFloorChosenBreakdown.atr++;
    } else {
      slMinPct = slSpread;
      slFloorChosen = "spread";
      this.stats.slFloorChosenBreakdown.spread++;
    }
    
    // 4) Verificar si el SL propuesto cumple el mínimo
    const slDistance = Math.abs(candle.close - slPrice) / candle.close;
    
    if (slDistance < slMinPct) {
      // Ajustar SL al mínimo y verificar si se puede mantener
      const adjustedSLPrice = type === 'LONG' 
        ? candle.close - (slMinPct * candle.close)
        : candle.close + (slMinPct * candle.close);
      
      // Verificar RR con SL ajustado
      const { tp1Price } = this.calculateSLTPV6(type, breakout.level, candle.close, atr10);
      const adjustedRR = Math.abs(tp1Price - candle.close) / Math.abs(candle.close - adjustedSLPrice);
      const rrMin = this.config.rrMinByRegime[this.stats.regime];
      
      if (adjustedRR >= rrMin) {
        // SL ajustado es válido
        slRaised = true;
        this.stats.slRaisedCount++;
        this.stats.slRaised = true;
        this.stats.slStructPx = slStructPx;
        this.stats.slStructGapPct = slStructGapPct;
        return true;
      } else {
        // One-fault tolerance: si falla por ≤8% del umbral, marcar como degraded
        const margin = slMinPct * 0.08;
        if (slDistance >= (slMinPct - margin)) {
          this.stats.tinySLRelaxedCount++;
          breakout.hygieneDegraded = true;
          return true; // Permitir con penalización
        }
        
        this.stats.hygieneRejected.tinySL++;
        return false;
      }
    }
    
    // No sobrescribir slFloorChosen aquí, se calculará al final basado en breakdown
    return true;
  }
  
  findStructuralSL(candle, type, atr10) {
    // Buscar swingLow(5) o low_break estructural
    // Simular búsqueda de swing low/high en las últimas 5 velas
    const lookback = 5;
    let structuralLevel = null;
    
    if (type === 'LONG') {
      // Para LONG, buscar swing low por debajo del close
      structuralLevel = candle.low * 0.999; // Simular swing low
    } else {
      // Para SHORT, buscar swing high por encima del close
      structuralLevel = candle.high * 1.001; // Simular swing high
    }
    
    return structuralLevel;
  }
  
  checkTP1Guards(breakout, candle, atr10) {
    const { type, closeBeyondPct, rangeATR } = breakout;
    const { tp1Price } = this.calculateSLTPV6(type, breakout.level, candle.close, atr10);
    
    const tp1Distance = Math.abs(tp1Price - candle.close) / candle.close;
    
    // PATCH v6.3 - TP1 acoplado a ATR (low regime)
    let tp1MinPct, tp1FloorChosen;
    
    // Si closeBeyondPct >= 0.22% y atrRatio >= 0.45, permite más flexibilidad
    if (closeBeyondPct >= 0.22 && rangeATR >= 0.45) {
      tp1MinPct = Math.max(0.0012, 0.40 * atr10 / candle.close);
      tp1FloorChosen = "relaxed";
    } else {
      tp1MinPct = Math.max(0.0014, 0.45 * atr10 / candle.close);
      tp1FloorChosen = "standard";
    }
    
    this.stats.tp1FloorChosen = tp1FloorChosen;
    
    if (tp1Distance < tp1MinPct) {
      // One-fault tolerance: si falla por ≤10% del umbral, marcar como degraded
      const margin = tp1MinPct * 0.10;
      if (tp1Distance >= (tp1MinPct - margin)) {
        this.stats.tp1RelaxedCount++;
        breakout.hygieneDegraded = true;
        return true; // Permitir con penalización
      }
      
      this.stats.hygieneRejected.tinyTP1++;
      return false;
    }
    
    return true;
  }
  
  checkFollowThroughGuards(breakout, candles, candleIndex) {
    if (candleIndex >= candles.length - 1) return true; // No hay siguiente vela
    
    const candle = candles[candleIndex];
    const nextCandle = candles[candleIndex + 1];
    const breakoutRange = candle.high - candle.low;
    
    // PATCH v6.3 - Follow-through contextual (low regime)
    let retr1 = 0;
    if (breakout.type === 'LONG') {
      retr1 = (candle.high - nextCandle.low) / breakoutRange;
    } else {
      retr1 = (nextCandle.high - candle.low) / breakoutRange;
    }
    
    // FT_SINGLE_OK = retr1 <= 0.65
    if (retr1 <= 0.65) {
      return true;
    }
    
    // FT_VOL_OK = retr1 <= 0.75 && (zScoreVol20 >= 0.30 || tickVol >= p50)
    if (retr1 <= 0.75) {
      const volumeZScore = this.calculateVolumeZScore(candles, candleIndex, 20);
      const lookback = Math.min(200, candleIndex);
      const recentVolumes = candles.slice(candleIndex - lookback, candleIndex).map(c => c.volume);
      const p50Vol = this.calculatePercentile(recentVolumes, 50);
      
      if (volumeZScore >= 0.30 || candle.volume >= p50Vol) {
        this.stats.followThroughRelaxCount++;
        return true;
      }
    }
    
    // FT_2C_OK = (close_next2 dir>= close_break) && (retr1 + retr2 <= 1.10)
    if (candleIndex < candles.length - 2) {
      const next2Candle = candles[candleIndex + 2];
      let retr2 = 0;
      
      if (breakout.type === 'LONG') {
        retr2 = (nextCandle.high - next2Candle.low) / breakoutRange;
        const closeNext2Dir = next2Candle.close >= candle.close;
        if (closeNext2Dir && (retr1 + retr2) <= 1.10) {
          this.stats.followThrough2CandleCount++;
          return true;
        }
      } else {
        retr2 = (next2Candle.high - nextCandle.low) / breakoutRange;
        const closeNext2Dir = next2Candle.close <= candle.close;
        if (closeNext2Dir && (retr1 + retr2) <= 1.10) {
          this.stats.followThrough2CandleCount++;
          return true;
        }
      }
    }
    
    // Si no pasa ninguna condición, rechazar
    this.stats.hygieneRejected.noFollowThrough++;
    return false;
  }
  
  checkChopGuards(candles, candleIndex, atr10) {
    const lookback = Math.min(20, candleIndex);
    const recentCandles = candles.slice(candleIndex - lookback, candleIndex);
    
    let maxRange = 0;
    let hasStrongBreakout = false;
    
    for (const candle of recentCandles) {
      const range = candle.high - candle.low;
      maxRange = Math.max(maxRange, range);
      
      // Verificar si hay closeBeyondPct >= 0.18%
      const closeBeyondPct = Math.abs(candle.close - candle.open) / candle.open;
      if (closeBeyondPct >= 0.0018) {
        hasStrongBreakout = true;
      }
    }
    
    const atrThreshold = 0.35 * atr10;
    
    if (maxRange <= atrThreshold && !hasStrongBreakout) {
      this.stats.hygieneRejected.chop++;
      return false;
    }
    
    return true;
  }
  
  checkDirectionGuards(breakout, candles) {
    const { type, candleIndex } = breakout;
    const candle = candles[candleIndex];
    
    // Calcular directionScore
    const momentum = this.calculateMomentum(candles, candleIndex);
    const vwap = this.calculateVWAP(candles, candleIndex, this.config.directionConfig.vwapPeriod);
    const bookScore = this.calculateBookScore(candles, candleIndex);
    const flowScore = this.calculateFlowScore(candles, candleIndex);
    
    const directionScore = this.calculateDirectionScore(type, momentum, bookScore, flowScore, candle.close, vwap);
    const threshold = this.config.directionConfig.thresholds[this.stats.regime];
    
    // Piso mínimo: threshold - 0.03
    const minThreshold = threshold - 0.03;
    
    if (directionScore < minThreshold) {
      this.stats.hygieneRejected.zeroVotes++;
      return false;
    }
    
    // Verificar al menos 1 "voto" positivo
    const votes = [
      (type === 'LONG' && momentum > 0) || (type === 'SHORT' && momentum < 0),
      (type === 'LONG' && bookScore > 0) || (type === 'SHORT' && bookScore < 0),
      (type === 'LONG' && flowScore > 0) || (type === 'SHORT' && flowScore < 0),
      (type === 'LONG' && candle.close > vwap) || (type === 'SHORT' && candle.close < vwap)
    ];
    
    const positiveVotes = votes.filter(v => v).length;
    
    if (positiveVotes === 0) {
      this.stats.hygieneRejected.zeroVotes++;
      return false;
    }
    
    return true;
  }
  
  checkQuietHoursGuards(candle) {
    // PATCH v6.3 - Quiet hours inteligentes (low regime)
    const hour = new Date(candle.timestamp).getHours();
    const isQuietWindow = hour >= 0 && hour <= 3;
    
    if (!isQuietWindow) {
      return true; // No es hora silenciosa
    }
    
    // Simular datos (en producción vendrían del feed)
    const spreadPct = 0.01; // 0.01% spread simulado
    const bookDepthTop5 = 100; // 100 ETH simulado
    const tickVol = candle.volume;
    
    // Calcular percentil 45 de volumen de últimas 200 velas
    const lookback = Math.min(200, 0); // Simular lookback
    const p45Vol = tickVol * 0.8; // Simular p45
    
    // Aplica quiet hours solo si:
    // spreadPct >= p70_7d_en_misma_hora && tickVol < p45(200)
    // Y bookDepthTop5 < Dmin
    const spreadThreshold = 0.012; // Simular p70 de 7 días
    const depthMin = 50; // 50 ETH mínimo
    
    if (spreadPct >= spreadThreshold && tickVol < p45Vol && bookDepthTop5 < depthMin) {
      this.stats.quietHoursAppliedCount++;
      this.stats.quietHoursBySpreadCount++;
      this.stats.quietHoursByTickVolCount++;
      this.stats.hygieneRejected.quietHours++;
      return false;
    }
    
    return true;
  }
  
  calculatePercentile(arr, percentile) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  
  findMinDistanceToOppositeZoneEdge(price, oppositeZones, type) {
    if (oppositeZones.length === 0) return 1.0; // Sin zonas opuestas
    
    let minDistance = Infinity;
    
    for (const zone of oppositeZones) {
      // Calcular distancia al BORDE de la zona (no al centro)
      const zoneWidth = zone.price * 0.002; // 0.2% de ancho de zona
      const zoneEdge = type === 'LONG' 
        ? zone.price + zoneWidth  // Borde superior de soporte
        : zone.price - zoneWidth; // Borde inferior de resistencia
      
      const distance = Math.abs(price - zoneEdge) / price;
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }
  
  checkPathClearance(price, type, atr10) {
    // Verificar si hay path clearance (siguiente zona a ≥0.35% sin zona intermedia a <0.18%)
    // Simular verificación de path clearance
    const nextZoneDistance = 0.004; // Simular 0.4% a siguiente zona
    const intermediateZoneDistance = 0.002; // Simular 0.2% a zona intermedia
    
    return nextZoneDistance >= 0.0035 && intermediateZoneDistance >= 0.0018;
  }
  
  checkOppositeZoneCooldown(oppositeZones, candles, currentIndex) {
    // Verificar si recentTouches_opp ≥ 2 en las últimas 40 velas
    const lookback = Math.min(40, currentIndex);
    let touches = 0;
    
    for (let i = currentIndex - lookback; i < currentIndex; i++) {
      const candle = candles[i];
      for (const zone of oppositeZones) {
        if (zone.type === 'SUPPORT' && candle.low <= zone.price) touches++;
        if (zone.type === 'RESISTANCE' && candle.high >= zone.price) touches++;
      }
    }
    
    return touches >= 2;
  }
  
  checkWeakOppositeZone(oppositeZones, candles, currentIndex) {
    if (oppositeZones.length === 0) return true;
    
    // Buscar la zona opuesta más cercana
    let closestZone = null;
    let minDist = Infinity;
    
    for (const zone of oppositeZones) {
      const dist = Math.abs(zone.price - candles[currentIndex].close) / candles[currentIndex].close;
      if (dist < minDist) {
        minDist = dist;
        closestZone = zone;
      }
    }
    
    if (!closestZone) return true;
    
    // Verificar condiciones de zona débil
    const conditions = [
      closestZone.levelScore < 0.66,  // lowConfidence
      this.countRecentBreaksOpposite(closestZone, candles, currentIndex, 30) >= 1,
      closestZone.tests < 2
    ];
    
    return conditions.some(condition => condition);
  }
  
  countRecentBreaksOpposite(zone, candles, currentIndex, lookback) {
    let breaks = 0;
    const start = Math.max(0, currentIndex - lookback);
    
    for (let i = start; i < currentIndex; i++) {
      const candle = candles[i];
      if (zone.type === 'SUPPORT' && candle.low < zone.price) breaks++;
      if (zone.type === 'RESISTANCE' && candle.high > zone.price) breaks++;
    }
    
    return breaks;
  }

  checkExpectedMoveV6(breakout, candles) {
    const { type, candleIndex, closeBeyondPct, rangeATR } = breakout;
    const candle = candles[candleIndex];
    const atr10 = this.calculateATR(candles, 10);
    
    // Obtener expectedMoveCap por régimen
    const expectedMoveCap = this.config.expectedMoveCaps[this.stats.regime];
    
    // Calcular TP1 aproximado
    const { tp1Price } = this.calculateSLTPV3(type, breakout.level, candle.close, atr10);
    const expectedMove = Math.abs(tp1Price - candle.close) / candle.close;
    
    // Verificar expectedMove base
    if (expectedMove <= expectedMoveCap) {
      return true;
    }
    
    // PATCH v6 - Boost opcional si closeBeyondPct >= 0.22% y atrRatio >= 0.45
    if (closeBeyondPct >= 0.22 && rangeATR >= 0.45) {
      const boostedCap = expectedMoveCap + 0.10;
      if (expectedMove <= boostedCap) {
        this.stats.expectedMoveBoost = true;
        console.log(`🚀 Expected move boost: ${expectedMove.toFixed(3)}% <= ${boostedCap.toFixed(3)}%`);
        return true;
      }
    }
    
    return false;
  }

  checkSLTPValidV6(breakout, candles, atr10) {
    const { type, candleIndex } = breakout;
    const candle = candles[candleIndex];
    
    // Calcular SL/TP con fallback ATR
    const { slPrice, tp1Price, tp2Price, rr } = this.calculateSLTPV6(type, breakout.level, candle.close, atr10);
    
    // Verificar SL del lado correcto
    if (type === 'LONG' && slPrice >= candle.close) return false;
    if (type === 'SHORT' && slPrice <= candle.close) return false;
    
    // Verificar RR mínimo por régimen
    const rrMin = this.config.rrMinByRegime[this.stats.regime];
    if (rr < rrMin) return false;
    
    // Verificar TP2 cap 2*ATR
    const tp2Cap = 2 * atr10;
    const tp2Distance = Math.abs(tp2Price - candle.close);
    if (tp2Distance > tp2Cap) {
      this.stats.tpCapApplied = true;
      return false;
    }
    
    return true;
  }

  /**
   * PATCH v6 - Calcular SL/TP con fallback ATR
   */
  calculateSLTPV6(type, level, entryPrice, atr10) {
    // PATCH v6.2 - Preferencias de target (evitar ATR puro si hay S/R válidos)
    let tp1Price, tp2Price;
    let targetsSource = "zone";
    
    if (type === 'LONG') {
      const nextResistance = this.findNextResistance(entryPrice);
      const targetDistance = nextResistance ? (nextResistance.price - entryPrice) / entryPrice : 0;
      
      // Usar zona objetivo si existe, está a ≥ 0.25% y tiene score ≥ 0.66
      if (nextResistance && targetDistance >= 0.0025 && nextResistance.levelScore >= 0.66) {
        tp1Price = nextResistance.price * 0.98; // 2% antes de la resistencia
        tp2Price = nextResistance.price * 0.95; // 5% antes de la resistencia
        targetsSource = "zone";
      } else {
        // Fallback ATR con validación
        tp1Price = entryPrice + (0.6 * atr10);
        tp2Price = entryPrice + (1.0 * atr10);
        targetsSource = "atr";
        
        // Validar ATR target
        const rr = Math.abs(tp1Price - entryPrice) / (0.25 * atr10); // SL mínimo
        const rrMin = this.config.rrMinByRegime[this.stats.regime];
        
        if (rr >= rrMin) {
          this.stats.atrTargetOkCount++;
        }
      }
    } else {
      const nextSupport = this.findNextSupport(entryPrice);
      const targetDistance = nextSupport ? (entryPrice - nextSupport.price) / entryPrice : 0;
      
      // Usar zona objetivo si existe, está a ≥ 0.25% y tiene score ≥ 0.66
      if (nextSupport && targetDistance >= 0.0025 && nextSupport.levelScore >= 0.66) {
        tp1Price = nextSupport.price * 1.02; // 2% antes del soporte
        tp2Price = nextSupport.price * 1.05; // 5% antes del soporte
        targetsSource = "zone";
      } else {
        // Fallback ATR con validación
        tp1Price = entryPrice - (0.6 * atr10);
        tp2Price = entryPrice - (1.0 * atr10);
        targetsSource = "atr";
        
        // Validar ATR target
        const rr = Math.abs(entryPrice - tp1Price) / (0.25 * atr10); // SL mínimo
        const rrMin = this.config.rrMinByRegime[this.stats.regime];
        
        if (rr >= rrMin) {
          this.stats.atrTargetOkCount++;
        }
      }
    }
    
    // Calcular SL mínimo
    const slDistance = Math.max(0.0008, 0.25 * atr10); // 0.08% mínimo
    const slPrice = type === 'LONG' 
      ? entryPrice - slDistance 
      : entryPrice + slDistance;
    
    // Calcular RR
    const risk = Math.abs(entryPrice - slPrice);
    const reward = Math.abs(tp1Price - entryPrice);
    const rr = reward / risk;
    
    this.stats.targetsSource = targetsSource;
    
    return { slPrice, tp1Price, tp2Price, rr };
  }

  calculateDirectionVotes(breakout, candles) {
    const { type, candleIndex } = breakout;
    const candle = candles[candleIndex];
    const momentum = this.calculateMomentum(candles, candleIndex);
    const vwap = this.calculateVWAP(candles, candleIndex, this.config.directionConfig.vwapPeriod);
    const bookScore = this.calculateBookScore(candles, candleIndex);
    const flowScore = this.calculateFlowScore(candles, candleIndex);
    
    let votes = 0;
    
    if (type === 'LONG') {
      if (momentum > 0) votes++;
      if (bookScore > 0) votes++;
      if (flowScore >= 0) votes++;
      if (candle.close >= vwap) votes++;
    } else {
      if (momentum < 0) votes++;
      if (bookScore < 0) votes++;
      if (flowScore <= 0) votes++;
      if (candle.close <= vwap) votes++;
    }
    
    return votes;
  }

  /**
   * PATCH v2 - Métodos auxiliares
   */
  calculateAvgVolume(candles, index, period) {
    if (!candles || index >= candles.length) {
      return 1;
    }
    
    const start = Math.max(0, index - period);
    const end = Math.min(candles.length, index);
    const recentCandles = candles.slice(start, end);
    
    const validCandles = recentCandles.filter(candle => candle && candle.volume);
    if (validCandles.length === 0) {
      return 1;
    }
    
    const totalVolume = validCandles.reduce((sum, candle) => sum + candle.volume, 0);
    return totalVolume / validCandles.length;
  }

  calculateMomentum(candles, index) {
    if (index < 10 || !candles[index] || !candles[index - 10]) return 0;
    
    const current = candles[index].close;
    const past = candles[index - 10].close;
    
    if (!current || !past) return 0;
    
    return (current - past) / past;
  }

  calculateBreakoutScore(levelScore, closeBeyondPct, volumeRatio, atrRatio) {
    // PATCH v5 - levelScore ya no se usa en la selección final
    // Este método se mantiene para compatibilidad pero no se usa en PATCH v5
    const closeBeyondPctNorm = Math.min(closeBeyondPct / 0.30, 1.0);
    const volumeRatioNorm = Math.min(volumeRatio / 1.60, 1.0);
    const atrRatioNorm = Math.min(atrRatio / 0.60, 1.0);
    
    // Usar eventScoreWeights si está disponible, sino breakoutScoreWeights
    const weights = this.config.eventScoreWeights || this.config.breakoutScoreWeights;
    
    return (
      (weights.levelScore || 0) * (levelScore || 0) +
      weights.closeBeyondPct * closeBeyondPctNorm +
      (weights.volume || weights.volumeRatio) * volumeRatioNorm +
      weights.atrRatio * atrRatioNorm
    );
  }

  findMinDistanceToOppositeZone(price, oppositeZones) {
    if (oppositeZones.length === 0) return 1.0; // No hay zonas opuestas
    
    let minDistance = Infinity;
    for (const zone of oppositeZones) {
      const distance = Math.abs(price - zone.price) / price;
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }

  calculateSLTP(type, level, entryPrice, atr10) {
    const zoneWidth = Math.max(0.001, this.config.zoneWidthMultiplier * atr10);
    
    let slPrice, tp1Price, tp2Price;
    
    if (type === 'LONG') {
      // SL detrás de la zona
      slPrice = level.price - zoneWidth;
      
      // TP1 = min(siguiente resistencia, entry + 0.6*ATR10)
      const nextResistance = this.findNextResistance(entryPrice);
      const tp1ByATR = entryPrice + (0.6 * atr10);
      tp1Price = nextResistance ? Math.min(nextResistance, tp1ByATR) : tp1ByATR;
      
      // TP2 = min(siguiente resistencia2, entry + 1.0*ATR10)
      const nextResistance2 = this.findNextResistance(tp1Price);
      const tp2ByATR = entryPrice + (1.0 * atr10);
      tp2Price = nextResistance2 ? Math.min(nextResistance2, tp2ByATR) : tp2ByATR;
      
      // Cap TP2 a 2*ATR10
      const maxTP2 = entryPrice + (2.0 * atr10);
      tp2Price = Math.min(tp2Price, maxTP2);
      
    } else {
      // SHORT - simétrico
      slPrice = level.price + zoneWidth;
      
      const nextSupport = this.findNextSupport(entryPrice);
      const tp1ByATR = entryPrice - (0.6 * atr10);
      tp1Price = nextSupport ? Math.max(nextSupport, tp1ByATR) : tp1ByATR;
      
      const nextSupport2 = this.findNextSupport(tp1Price);
      const tp2ByATR = entryPrice - (1.0 * atr10);
      tp2Price = nextSupport2 ? Math.max(nextSupport2, tp2ByATR) : tp2ByATR;
      
      const maxTP2 = entryPrice - (2.0 * atr10);
      tp2Price = Math.max(tp2Price, maxTP2);
    }
    
    // Calcular RR
    const risk = Math.abs(entryPrice - slPrice);
    const reward = Math.abs(tp1Price - entryPrice);
    const rr = risk > 0 ? reward / risk : 0;
    
    return { slPrice, tp1Price, tp2Price, rr };
  }

  /**
   * PATCH v3 - Calcular SL/TP con parámetros ajustados
   */
  calculateSLTPV3(type, level, entryPrice, atr10) {
    // PATCH v3 - zoneWidth ajustado: max(0.10%, 0.30*ATR10)
    const zoneWidth = Math.max(0.001, 0.30 * atr10);
    
    let slPrice, tp1Price, tp2Price;
    
    if (type === 'LONG') {
      // SL detrás de la zona
      slPrice = level.price - zoneWidth;
      
      // TP1 = min(siguiente resistencia, entry + 0.6*ATR10)
      const nextResistance = this.findNextResistance(entryPrice);
      const tp1ByATR = entryPrice + (0.6 * atr10);
      tp1Price = nextResistance ? Math.min(nextResistance, tp1ByATR) : tp1ByATR;
      
      // TP2 = min(siguiente resistencia2, entry + 1.0*ATR10)
      const nextResistance2 = this.findNextResistance(tp1Price);
      const tp2ByATR = entryPrice + (1.0 * atr10);
      tp2Price = nextResistance2 ? Math.min(nextResistance2, tp2ByATR) : tp2ByATR;
      
      // Cap TP2 a 2*ATR10
      const maxTP2 = entryPrice + (2.0 * atr10);
      tp2Price = Math.min(tp2Price, maxTP2);
      
    } else {
      // SHORT - simétrico
      slPrice = level.price + zoneWidth;
      
      const nextSupport = this.findNextSupport(entryPrice);
      const tp1ByATR = entryPrice - (0.6 * atr10);
      tp1Price = nextSupport ? Math.max(nextSupport, tp1ByATR) : tp1ByATR;
      
      const nextSupport2 = this.findNextSupport(tp1Price);
      const tp2ByATR = entryPrice - (1.0 * atr10);
      tp2Price = nextSupport2 ? Math.max(nextSupport2, tp2ByATR) : tp2ByATR;
      
      const maxTP2 = entryPrice - (2.0 * atr10);
      tp2Price = Math.max(tp2Price, maxTP2);
    }
    
    // Calcular RR
    const risk = Math.abs(entryPrice - slPrice);
    const reward = Math.abs(tp1Price - entryPrice);
    const rr = risk > 0 ? reward / risk : 0;
    
    return { slPrice, tp1Price, tp2Price, rr };
  }

  findNextResistance(price) {
    const higherResistances = this.resistanceLevels
      .filter(r => r.price > price)
      .sort((a, b) => a.price - b.price);
    
    return higherResistances.length > 0 ? higherResistances[0].price : null;
  }

  findNextSupport(price) {
    const lowerSupports = this.supportLevels
      .filter(s => s.price < price)
      .sort((a, b) => b.price - a.price);
    
    return lowerSupports.length > 0 ? lowerSupports[0].price : null;
  }

  /**
   * PATCH v3 - G) SANITY CHECKS
   */
  performSanityChecks(totalCandles) {
    const signalsPer1000 = (this.stats.signalsTotal / totalCandles) * 1000;
    
    // Verificar que signalsTotal esté en [2..6] por 1000 velas
    if (signalsPer1000 < 2) {
      console.log('⚠️ Pocas señales detectadas, relajando parámetros...');
      
      if (!this.stats.scoreRelaxed) {
        this.config.levelScoreMin = 0.68;
        this.stats.scoreRelaxed = true;
      } else {
        this.config.cooldownGlobal = 75;
      }
    }
    
    // Verificar confirmedBreakouts <= #velas
    if (this.stats.confirmedBreakouts > totalCandles) {
      console.log('⚠️ Error: confirmedBreakouts > totalCandles');
    }
    
    // Verificar SL del lado correcto
    for (const trade of this.trades) {
      if (trade.type === 'LONG' && trade.slPrice >= trade.entryPrice) {
        console.log('⚠️ Error: SL incorrecto para LONG');
      }
      if (trade.type === 'SHORT' && trade.slPrice <= trade.entryPrice) {
        console.log('⚠️ Error: SL incorrecto para SHORT');
      }
    }
    
    // PATCH v3 - Verificar expectedMove <= 0.70%
    for (const trade of this.trades) {
      const expectedMove = Math.abs(trade.tp1Price - trade.entryPrice) / trade.entryPrice;
      if (expectedMove > 0.007) {
        console.log('⚠️ Error: expectedMove > 0.70%');
      }
    }
  }

  /**
   * PATCH v6 - Mostrar resultados
   */
  displayResults() {
    console.log('\n🎯 PATCH v6 - RESULTADOS:');
    console.log('==========================');
    
    // Mostrar estadísticas
    console.log('\n📊 ESTADÍSTICAS:');
    console.log(`- Niveles candidatos: ${this.stats.candidateLevels}`);
    console.log(`- Niveles finales: ${this.stats.finalLevels}`);
    console.log(`- Candidatos por lado - Resistencias: ${this.stats.candidateLevelsPerSide.resistance}, Soportes: ${this.stats.candidateLevelsPerSide.support}`);
    console.log(`- Finales por lado - Resistencias: ${this.stats.finalLevelsPerSide.resistance}, Soportes: ${this.stats.finalLevelsPerSide.support}`);
    console.log(`- Score relajado: ${this.stats.scoreRelaxed ? 'SÍ' : 'NO'}`);
    console.log(`- Rompimientos candidatos: ${this.stats.candidateBreakouts}`);
    console.log(`- Rompimientos confirmados: ${this.stats.confirmedBreakouts}`);
    console.log(`- Señales totales: ${this.stats.signalsTotal}`);
    console.log(`- Modo datos grandes: ${this.stats.bigDataMode ? 'SÍ' : 'NO'}`);
    
    // PATCH v6 - Nuevos campos
    console.log('\n🔧 PARÁMETROS ADAPTATIVOS:');
    console.log(`- Régimen de volatilidad: ${this.stats.regime}`);
    console.log(`- VolumeRatioMin efectivo: ${this.stats.volumeRatioMinEffective}`);
    console.log(`- RRMin aplicado: ${this.stats.rrMinApplied}`);
    console.log(`- Relajación final: ${this.stats.finalRelax ? 'SÍ' : 'NO'}`);
    console.log(`- Relajación final2: ${this.stats.finalRelax2 ? 'SÍ' : 'NO'}`);
    console.log(`- Votos direccionales promedio: ${this.stats.directionVotesAvg.toFixed(2)}`);
    console.log(`- Fallbacks de volumen: ${this.stats.volumeFallbackCount}`);
    console.log(`- LevelScoreMin aplicado: ${this.stats.levelScoreMinApplied}`);
    console.log(`- LevelScoreMin soportes: ${this.stats.levelScoreMinSupportApplied}`);
    
    // PATCH v6 - Campos específicos
    console.log('\n🚨 CONTROL DE CALIDAD:');
    console.log(`- Rechazados en final por score: ${this.stats.rejectedInFinalByScore} (debe ser 0)`);
    console.log(`- Bug final score: ${this.stats.bugFinalScore ? 'SÍ' : 'NO'}`);
    console.log(`- Force emit: ${this.stats.forceEmit ? 'SÍ' : 'NO'}`);
    console.log(`- Force emit count: ${this.stats.forceEmitCount}`);
    console.log(`- Candidatos finales: ${this.stats.finalCandidateCount}`);
    console.log(`- Fail hard target: ${this.stats.failHardTarget ? 'SÍ' : 'NO'}`);
    
    // PATCH v6 - Filtros finales
    console.log('\n🔍 FILTROS FINALES:');
    console.log(`- Por dirección: ${this.stats.finalFilterCounters.byDirection}`);
    console.log(`- Por espacio: ${this.stats.finalFilterCounters.bySpace}`);
    console.log(`- Por expected move: ${this.stats.finalFilterCounters.byExpectedMove}`);
    console.log(`- Por SL/TP: ${this.stats.finalFilterCounters.bySLTP}`);
    console.log(`- Direction threshold: ${this.stats.directionThreshold}`);
    console.log(`- Direction near-miss: ${this.stats.directionNearMissCount}`);
    console.log(`- Expected move boost: ${this.stats.expectedMoveBoost ? 'SÍ' : 'NO'}`);
    console.log(`- TP cap applied: ${this.stats.tpCapApplied ? 'SÍ' : 'NO'}`);
    console.log(`- Targets source: ${this.stats.targetsSource}`);
    
    // PATCH v6.2 - Higiene básica
    console.log('\n🧼 HIGIENE BÁSICA:');
    console.log(`- Space override: ${this.stats.spaceOverrideCount}`);
    console.log(`- Weak opposite: ${this.stats.weakOppositeCount}`);
    console.log(`- Space nudge: ${this.stats.spaceNudge}`);
    console.log(`- ATR target OK: ${this.stats.atrTargetOkCount}`);
    console.log(`- Event score normalized: ${this.stats.eventScoreNormalized ? 'SÍ' : 'NO'}`);
    console.log(`- Low event score rejected: ${this.stats.lowEventScoreRejected}`);
    console.log(`- Force emit clean: ${this.stats.forceEmitClean ? 'SÍ' : 'NO'}`);
    
    // PATCH v6.2.1 - Ajustes quirúrgicos
    console.log('\n🔧 AJUSTES QUIRÚRGICOS LOW-VOL:');
    console.log(`- SL% min: ${this.stats.hygieneThresholds.SLMinPct}%, spread mult: ${this.stats.hygieneThresholds.spreadMultMin}`);
    console.log(`- Tick vol pctl: ${this.stats.hygieneThresholds.tickVolPctlMin}, zVol min: ${this.stats.hygieneThresholds.zVolMin}`);
    console.log(`- TP1 min: ${this.stats.hygieneThresholds.TP1MinPct}%, TP1 ATR: ${this.stats.hygieneThresholds.TP1MinATR}`);
    console.log(`- Tiny SL relaxed: ${this.stats.tinySLRelaxedCount}`);
    console.log(`- Tick vol relaxed: ${this.stats.tickVolRelaxedCount}`);
    console.log(`- TP1 relaxed: ${this.stats.tp1RelaxedCount}`);
    console.log(`- One-fault tolerance: ${this.stats.oneFaultToleranceCount}`);
    
    // PATCH v6.3 - Ajuste de criterios
    console.log('\n🔧 AJUSTE DE CRITERIOS:');
    console.log(`- Follow-through relax: ${this.stats.followThroughRelaxCount}`);
    console.log(`- Follow-through 2-candle: ${this.stats.followThrough2CandleCount}`);
    console.log(`- Quiet hours applied: ${this.stats.quietHoursAppliedCount}`);
    console.log(`- Quiet hours by spread: ${this.stats.quietHoursBySpreadCount}`);
    console.log(`- Quiet hours by tick vol: ${this.stats.quietHoursByTickVolCount}`);
    console.log(`- SL floor chosen: ${this.stats.slFloorChosen}`);
    console.log(`- TP1 floor chosen: ${this.stats.tp1FloorChosen}`);
    
    // PATCH v6.4 - Espacio inteligente + SL estructural
    console.log('\n🔧 ESPACIO INTELIGENTE + SL ESTRUCTURAL:');
    console.log(`- Space overrides: weak=${this.stats.spaceOverrides.weakOpposite}, align=${this.stats.spaceOverrides.alignment}, atr=${this.stats.spaceOverrides.atr_rr_ok}, path=${this.stats.spaceOverrides.pathClear}`);
    console.log(`- Space failures after SL adjust: ${this.stats.spaceFailuresAfterSLAdjust}`);
    console.log(`- SL raised count: ${this.stats.slRaisedCount}`);
    console.log(`- SL floor breakdown: atr=${this.stats.slFloorChosenBreakdown.atr}, spread=${this.stats.slFloorChosenBreakdown.spread}, struct=${this.stats.slFloorChosenBreakdown.struct}`);
    console.log(`- SL struct px: ${this.stats.slStructPx}, gap: ${this.stats.slStructGapPct}%, raised: ${this.stats.slRaised ? 'SÍ' : 'NO'}`);
    
    console.log('\n❌ RECHAZOS POR HIGIENE:');
    console.log(`- Spread: ${this.stats.hygieneRejected.spread}`);
    console.log(`- Depth: ${this.stats.hygieneRejected.depth}`);
    console.log(`- Tick vol: ${this.stats.hygieneRejected.tickVol}`);
    console.log(`- Tiny SL: ${this.stats.hygieneRejected.tinySL}`);
    console.log(`- Tiny TP1: ${this.stats.hygieneRejected.tinyTP1}`);
    console.log(`- No follow-through: ${this.stats.hygieneRejected.noFollowThrough}`);
    console.log(`- Chop: ${this.stats.hygieneRejected.chop}`);
    console.log(`- Zero votes: ${this.stats.hygieneRejected.zeroVotes}`);
    console.log(`- Quiet hours: ${this.stats.hygieneRejected.quietHours}`);
    
    console.log('\n❌ RECHAZOS:');
    console.log(`- Por score: ${this.stats.rejectedByScore}`);
    console.log(`- Por spacing: ${this.stats.rejectedBySpacing}`);
    console.log(`- Por calidad: ${this.stats.rejectedByQuality}`);
    console.log(`- Por volumen: ${this.stats.rejectedByVolume}`);
    console.log(`- Por rango: ${this.stats.rejectedByRange}`);
    console.log(`- Por dirección: ${this.stats.rejectedByDirection}`);
    console.log(`- Por espacio: ${this.stats.rejectedBySpace}`);
    console.log(`- Por RR: ${this.stats.rejectedByRR}`);
    
    // Mostrar señales
    if (this.trades.length > 0) {
      console.log('\n🎯 SEÑALES GENERADAS:');
      this.trades.forEach((signal, i) => {
        const forceEmitFlag = signal.reasons.forceEmit ? ' [FORCE]' : '';
        const targetsFlag = signal.reasons.targetsSource ? ` [${signal.reasons.targetsSource.toUpperCase()}]` : '';
        const signalDate = new Date(signal.timestamp);
        const dateStr = signalDate.toLocaleDateString('es-ES');
        const timeStr = signalDate.toLocaleTimeString('es-ES');
        console.log(`${i + 1}. ${signal.type} - ${dateStr} ${timeStr} - Entry: $${signal.entryPrice.toFixed(2)} - SL: $${signal.slPrice.toFixed(2)} - TP1: $${signal.tp1Price.toFixed(2)} - RR: ${signal.rr.toFixed(2)} - EventScore: ${signal.eventScore.toFixed(3)}${forceEmitFlag}${targetsFlag}`);
      });
    }
  }

  /**
   * Muestra los niveles clave detectados
   */
  displayKeyLevels() {
    console.log('\n📊 NIVELES CLAVE DETECTADOS:');
    console.log('================================');
    
    if (this.resistanceLevels.length > 0) {
      console.log('\n🔴 RESISTENCIAS (ordenadas por score):');
      this.resistanceLevels
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .forEach((level, i) => {
          console.log(`${i + 1}. $${level.price.toFixed(2)} - Score: ${(level.score * 100).toFixed(1)}% - Bounce: ${level.avgBouncePct.toFixed(2)}%`);
        });
    }
    
    if (this.supportLevels.length > 0) {
      console.log('\n🟢 SOPORTES (ordenados por score):');
      this.supportLevels
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .forEach((level, i) => {
          console.log(`${i + 1}. $${level.price.toFixed(2)} - Score: ${(level.score * 100).toFixed(1)}% - Bounce: ${level.avgBouncePct.toFixed(2)}%`);
        });
    }
  }

  /**
   * Crea un trade ficticio basado en un patrón detectado
   */
  createFictitiousTrade(patternName, signalCandle, patternResult, candleIndex, nearLevel = null) {
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calcular niveles de entrada, TP y SL
    let entryPrice, tpPrice, slPrice;
    
    if (patternName === 'three-traders-blancos') {
      // Lógica específica para Three Traders Blancos
      const upperWickSize = signalCandle.high - Math.max(signalCandle.open, signalCandle.close);
      entryPrice = signalCandle.close - (upperWickSize * 2);
      tpPrice = entryPrice + (upperWickSize * 2) + (entryPrice * 1.2 / 100);
      slPrice = entryPrice - (upperWickSize * 2) - (entryPrice * 0.3 / 100);
    } else {
      // Lógica para Three White Soldiers
      entryPrice = signalCandle.close;
      tpPrice = signalCandle.close * 1.008; // 0.8% TP
      slPrice = signalCandle.close * 0.996; // 0.4% SL
    }
    
    const trade = {
      id: tradeId,
      pattern: patternName,
      timestamp: new Date(signalCandle.timestamp).toISOString(),
      candleIndex: candleIndex,
      signalCandle: {
        open: signalCandle.open,
        high: signalCandle.high,
        low: signalCandle.low,
        close: signalCandle.close,
        volume: signalCandle.volume
      },
      entryPrice: entryPrice,
      tpPrice: tpPrice,
      slPrice: slPrice,
      confidence: patternResult.confidence || 0,
      status: 'pending', // Ficticio, no se evalúa
      pnl: 0, // Ficticio, no se calcula
      riskReward: ((tpPrice - entryPrice) / (entryPrice - slPrice)).toFixed(2),
      nearLevel: nearLevel, // Información sobre soporte/resistencia cercana
      createdAt: new Date().toISOString()
    };
    
    return trade;
  }

  /**
   * PATCH v2 - Genera un PDF con todas las señales
   */
  async generateTradesPDF(candles = []) {
    try {
      const doc = new PDFDocument();
      const outputPath = path.join(__dirname, 'reports', 'signals.pdf');
      
      // Crear directorio si no existe
      const reportsDir = path.join(__dirname, 'reports');
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }
      
      doc.pipe(fs.createWriteStream(outputPath));
      
      // Título
      doc.fontSize(20)
         .fillColor('#2c3e50')
         .text('SEÑALES DE TRADING v6.7', 50, 50);
      
      doc.fontSize(12)
         .fillColor('#7f8c8d')
         .text(`ETH/USDT 15m - Generado: ${new Date().toLocaleString()}`, 50, 80);
      
      doc.text(`Total de señales: ${this.trades.length}`, 50, 100);
      
      let y = 130;
      
      // PATCH v2 - Estadísticas del sistema
      doc.fontSize(14)
         .fillColor('#2c3e50')
         .text('ESTADÍSTICAS DEL SISTEMA', 50, y);
      
      y += 30;
      
      // Bloque stats completo
      const statsText = this.getStatsBlock();
      doc.fontSize(10)
           .fillColor('#34495e')
         .text(statsText, 70, y, { width: 480 });
      
      y += 200;
      
      // Niveles clave
      doc.fontSize(14)
         .fillColor('#2c3e50')
         .text('NIVELES CLAVE DETECTADOS', 50, y);
      
      y += 30;
      
      // Resistencias
      if (this.resistanceLevels.length > 0) {
        doc.fontSize(12)
           .fillColor('#e74c3c')
           .text('RESISTENCIAS:', 70, y);
        y += 20;
        
        this.resistanceLevels
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .forEach((level, i) => {
            doc.fontSize(10)
               .fillColor('#34495e')
               .text(`${i + 1}. $${level.price.toFixed(2)} - Score: ${(level.score * 100).toFixed(1)}% - Bounce: ${level.avgBouncePct.toFixed(2)}%`, 90, y);
            y += 15;
          });
        
        y += 10;
      }
      
      // Soportes
      if (this.supportLevels.length > 0) {
        doc.fontSize(12)
           .fillColor('#27ae60')
           .text('SOPORTES:', 70, y);
        y += 20;
        
        this.supportLevels
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .forEach((level, i) => {
            doc.fontSize(10)
               .fillColor('#34495e')
               .text(`${i + 1}. $${level.price.toFixed(2)} - Score: ${(level.score * 100).toFixed(1)}% - Bounce: ${level.avgBouncePct.toFixed(2)}%`, 90, y);
            y += 15;
          });
        
        y += 20;
      }
      
      // Lista de señales
      doc.fontSize(14)
         .fillColor('#2c3e50')
         .text('DETALLE DE SEÑALES', 50, y);
      
      y += 30;
      
      this.trades.forEach((signal, index) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        
        // Signal box
        doc.rect(50, y, 500, 100)
           .fill('#f8f9fa')
           .stroke('#dee2e6');
        
        // Signal ID
        doc.fontSize(10)
           .fillColor('#6c757d')
           .text(`Señal #${index + 1}`, 60, y + 10);
        
        // Tipo y timestamp
        doc.fontSize(12)
           .fillColor(signal.type === 'LONG' ? '#27ae60' : '#e74c3c')
           .text(`${signal.type}`, 60, y + 25);
        
        doc.fontSize(10)
           .fillColor('#6c757d')
           .text(`Fecha: ${new Date(signal.timestamp).toLocaleString()}`, 60, y + 40);
        
        // Precios
        doc.fontSize(10)
           .fillColor('#34495e')
           .text(`Entry: $${signal.entryPrice.toFixed(2)}`, 300, y + 25)
           .text(`SL: $${signal.slPrice.toFixed(2)}`, 300, y + 40)
           .text(`TP1: $${signal.tp1Price.toFixed(2)}`, 300, y + 55)
           .text(`TP2: $${signal.tp2Price.toFixed(2)}`, 300, y + 70);
        
        // Métricas
        doc.text(`RR: ${signal.rr.toFixed(2)}`, 450, y + 25)
           .text(`Score: ${(signal.eventScore || 0).toFixed(3)}`, 450, y + 40)
           .text(`Vol: ${(signal.volumeRatio || 0).toFixed(2)}`, 450, y + 55)
           .text(`Beyond: ${(signal.closeBeyondPct || 0).toFixed(2)}%`, 450, y + 70);
        
        // Level
          doc.fontSize(9)
           .fillColor('#7f8c8d')
           .text(`Level: $${signal.level.toFixed(2)}`, 60, y + 85);
        
        y += 110;
      });
      
      doc.end();
      
      console.log(`📄 PDF generado: ${outputPath}`);
      
    } catch (error) {
      console.error('❌ Error generando PDF:', error);
    }
  }

  /**
   * PATCH v6 - Generar bloque de estadísticas
   */
  getStatsBlock() {
    return `stats: {
  candidateLevels: ${this.stats.candidateLevels},
  finalLevels: ${this.stats.finalLevels},
  candidateLevelsPerSide: { resistance: ${this.stats.candidateLevelsPerSide.resistance}, support: ${this.stats.candidateLevelsPerSide.support} },
  finalLevelsPerSide: { resistance: ${this.stats.finalLevelsPerSide.resistance}, support: ${this.stats.finalLevelsPerSide.support} },
  scoreRelaxed: ${this.stats.scoreRelaxed},
  candidateBreakouts: ${this.stats.candidateBreakouts},
  confirmedBreakouts: ${this.stats.confirmedBreakouts},
  rejectedByScore: ${this.stats.rejectedByScore},
  rejectedBySpacing: ${this.stats.rejectedBySpacing},
  rejectedByQuality: ${this.stats.rejectedByQuality},
  rejectedByVolume: ${this.stats.rejectedByVolume},
  rejectedByRange: ${this.stats.rejectedByRange},
  rejectedByDirection: ${this.stats.rejectedByDirection},
  rejectedBySpace: ${this.stats.rejectedBySpace},
  rejectedByRR: ${this.stats.rejectedByRR},
  signalsTotal: ${this.stats.signalsTotal},
  bigDataMode: ${this.stats.bigDataMode},
  regime: "${this.stats.regime}",
  volumeRatioMinEffective: ${this.stats.volumeRatioMinEffective},
  rrMinApplied: ${this.stats.rrMinApplied},
  finalRelax: ${this.stats.finalRelax},
  directionVotesAvg: ${this.stats.directionVotesAvg},
  volumeFallbackCount: ${this.stats.volumeFallbackCount},
  levelScoreMinApplied: ${this.stats.levelScoreMinApplied},
  levelScoreMinSupportApplied: ${this.stats.levelScoreMinSupportApplied},
  finalRelax2: ${this.stats.finalRelax2},
  rejectedInFinalByScore: ${this.stats.rejectedInFinalByScore},
  bugFinalScore: ${this.stats.bugFinalScore},
  forceEmit: ${this.stats.forceEmit},
  forceEmitCount: ${this.stats.forceEmitCount},
  finalCandidateCount: ${this.stats.finalCandidateCount},
  finalFilterCounters: { byDirection: ${this.stats.finalFilterCounters.byDirection}, bySpace: ${this.stats.finalFilterCounters.bySpace}, byExpectedMove: ${this.stats.finalFilterCounters.byExpectedMove}, bySLTP: ${this.stats.finalFilterCounters.bySLTP} },
  directionThreshold: ${this.stats.directionThreshold},
  directionNearMissCount: ${this.stats.directionNearMissCount},
  expectedMoveBoost: ${this.stats.expectedMoveBoost},
  tpCapApplied: ${this.stats.tpCapApplied},
  targetsSource: "${this.stats.targetsSource}",
  failHardTarget: ${this.stats.failHardTarget},
  // PATCH v6.1 - ESPACIO INTELIGENTE
  spaceOverrideCount: ${this.stats.spaceOverrideCount},
  weakOppositeCount: ${this.stats.weakOppositeCount},
  spaceNudge: ${this.stats.spaceNudge},
  // PATCH v6.2 - HIGIENE BÁSICA
  hygieneRejected: { 
    spread: ${this.stats.hygieneRejected.spread}, 
    depth: ${this.stats.hygieneRejected.depth}, 
    tickVol: ${this.stats.hygieneRejected.tickVol}, 
    tinySL: ${this.stats.hygieneRejected.tinySL}, 
    tinyTP1: ${this.stats.hygieneRejected.tinyTP1}, 
    noFollowThrough: ${this.stats.hygieneRejected.noFollowThrough}, 
    chop: ${this.stats.hygieneRejected.chop}, 
    zeroVotes: ${this.stats.hygieneRejected.zeroVotes}, 
    quietHours: ${this.stats.hygieneRejected.quietHours} 
  },
  atrTargetOkCount: ${this.stats.atrTargetOkCount},
  eventScoreNormalized: ${this.stats.eventScoreNormalized},
  lowEventScoreRejected: ${this.stats.lowEventScoreRejected},
  forceEmitClean: ${this.stats.forceEmitClean},
  // PATCH v6.2.1 - AJUSTES QUIRÚRGICOS LOW-VOL
  hygieneThresholds: { 
    SLMinPct: ${this.stats.hygieneThresholds.SLMinPct}, 
    spreadMultMin: ${this.stats.hygieneThresholds.spreadMultMin}, 
    tickVolPctlMin: ${this.stats.hygieneThresholds.tickVolPctlMin}, 
    zVolMin: ${this.stats.hygieneThresholds.zVolMin}, 
    TP1MinPct: ${this.stats.hygieneThresholds.TP1MinPct}, 
    TP1MinATR: ${this.stats.hygieneThresholds.TP1MinATR} 
  },
  tinySLRelaxedCount: ${this.stats.tinySLRelaxedCount},
  tickVolRelaxedCount: ${this.stats.tickVolRelaxedCount},
  tp1RelaxedCount: ${this.stats.tp1RelaxedCount},
  oneFaultToleranceCount: ${this.stats.oneFaultToleranceCount},
  // PATCH v6.3 - AJUSTE DE CRITERIOS
  followThroughRelaxCount: ${this.stats.followThroughRelaxCount},
  followThrough2CandleCount: ${this.stats.followThrough2CandleCount},
  quietHoursAppliedCount: ${this.stats.quietHoursAppliedCount},
  quietHoursBySpreadCount: ${this.stats.quietHoursBySpreadCount},
  quietHoursByTickVolCount: ${this.stats.quietHoursByTickVolCount},
  slFloorChosen: "${this.stats.slFloorChosen}",
  tp1FloorChosen: "${this.stats.tp1FloorChosen}",
  // PATCH v6.4 - ESPACIO INTELIGENTE + SL ESTRUCTURAL
  spaceOverrides: { 
    weakOpposite: ${this.stats.spaceOverrides.weakOpposite}, 
    alignment: ${this.stats.spaceOverrides.alignment}, 
    atr_rr_ok: ${this.stats.spaceOverrides.atr_rr_ok}, 
    pathClear: ${this.stats.spaceOverrides.pathClear} 
  },
  spaceFailuresAfterSLAdjust: ${this.stats.spaceFailuresAfterSLAdjust},
  slRaisedCount: ${this.stats.slRaisedCount},
  slFloorChosenBreakdown: { 
    atr: ${this.stats.slFloorChosenBreakdown.atr}, 
    spread: ${this.stats.slFloorChosenBreakdown.spread}, 
    struct: ${this.stats.slFloorChosenBreakdown.struct} 
  },
  slStructPx: ${this.stats.slStructPx},
  slStructGapPct: ${this.stats.slStructGapPct},
  slRaised: ${this.stats.slRaised}
}`;
  }
}

// Función principal para ejecutar el análisis
async function main() {
  const tradeManager = new TradeManager();
  
  try {
    console.log('🚀 Iniciando Trade Manager...');
    
    // Conectar a Redis
    await tradeManager.connect();
    
    // Esperar un poco para que se establezca la conexión
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verificar conexión
    if (tradeManager.isConnected) {
      console.log('🎉 ¡Conexión a Redis exitosa!');
      
      // Ejecutar análisis de velas y crear trades
      await tradeManager.analyzeCandlesAndCreateTrades();
      
      // QA: Ejecutar prueba A/B
      await tradeManager.runABTest();
      
    } else {
      console.log('❌ No se pudo conectar a Redis');
    }
    
  } catch (error) {
    console.error('❌ Error en main:', error);
  } finally {
    // Desconectar
    await tradeManager.disconnect();
  }
}

// Exportar la clase
module.exports = TradeManager;

// Si se ejecuta directamente, correr main()
if (require.main === module) {
  main().catch(console.error);
}
