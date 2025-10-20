const DataManager = require('./get-data');

class SRDetector {
  constructor() {
    this.dataManager = new DataManager();
    this.isConnected = false;
    
    // Configuración de frecuencia y calidad
    this.config = {
      cooldownPerLevel: 20,        // velas entre señales del mismo nivel
      cooldownGlobal: 120,         // velas entre señales globales
      maxSignalsPerWindow: 6,      // máximo señales por 1000 velas
      levelScoreMin: 0.75,         // score mínimo para niveles (subido de 0.72)
      closeBeyondPct: 0.15,        // subido de 0.12%
      volumeRatioMin: 1.20,        // subido de 1.10
      rangeMinATR: 0.35,           // rango mínimo vs ATR
      minSpacing: 0.25,            // reducido para más niveles
      minSpacingATR: 0.6,          // reducido de 0.7
      targetFinalLevelsPerSide: [3, 6], // objetivo de niveles por lado
      expectedMoveMax: 0.70,       // máximo movimiento esperado
      oppositeZoneMin: 0.25,       // distancia mínima a zona opuesta
      rrMin: 1.5                   // ratio riesgo/beneficio mínimo
    };
  }

  async connect() {
    try {
      await this.dataManager.connect();
      this.isConnected = true;
      console.log('✅ Conectado a Redis para detección S/R');
    } catch (error) {
      console.error('❌ Error conectando a Redis:', error);
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.dataManager.disconnect();
      this.isConnected = false;
      console.log('🔌 Desconectado de Redis');
    }
  }

  /**
   * Detecta soportes y resistencias significativos con rompimientos
   * @param {boolean} use100K - Usar 100K velas o 1000 por defecto
   * @returns {Object} Resultado con niveles, rompimientos y señales
   */
  async detectSRAndBreakouts(use100K = false) {
    try {
      console.log('🔍 Iniciando detección S/R conservadora...');
      
      // Obtener velas
      const candles = await this.dataManager.getCandles('ETHUSDT', '15m', 1000, use100K);
      
      if (candles.length < 100) {
        throw new Error('Insuficientes velas para análisis S/R');
      }

      console.log(`📊 Analizando ${candles.length} velas para S/R...`);

      // Calcular indicadores técnicos
      const indicators = this.calculateIndicators(candles);
      
      // Detectar niveles S/R
      const levels = this.detectSignificantLevels(candles, indicators);
      
      // Detectar rompimientos
      const breakouts = this.detectBreakouts(candles, levels, indicators);
      
      // Generar señales
      const signals = this.generateSignals(candles, levels, breakouts, indicators);
      
      // Calcular estadísticas
      const stats = this.calculateStats(levels, breakouts, signals);
      
      const result = {
        levels,
        breakouts,
        signals,
        stats
      };

      console.log('✅ Detección S/R completada');
      this.logResults(result);
      
      return result;

    } catch (error) {
      console.error('❌ Error en detección S/R:', error);
      throw error;
    }
  }

  /**
   * Calcula indicadores técnicos necesarios
   */
  calculateIndicators(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    
    // ATR(10)
    const atr10 = this.calculateATR(candles, 10);
    
    // VWAP
    const vwap = this.calculateVWAP(candles);
    
    // Promedio de volumen de las últimas 20 velas
    const avgVolume20 = this.calculateAverageVolume(volumes, 20);
    
    // Máximos y mínimos del día (últimas 96 velas = 24 horas en 15m)
    const dayHigh = Math.max(...highs.slice(-96));
    const dayLow = Math.min(...lows.slice(-96));
    
    return {
      atr10,
      vwap,
      avgVolume20,
      dayHigh,
      dayLow,
      currentPrice: closes[closes.length - 1]
    };
  }

  /**
   * Calcula ATR
   */
  calculateATR(candles, period) {
    const atrValues = [];
    
    for (let i = period; i < candles.length; i++) {
      const trueRanges = [];
      
      for (let j = i - period + 1; j <= i; j++) {
        const current = candles[j];
        const previous = candles[j - 1];
        
        const tr1 = current.high - current.low;
        const tr2 = Math.abs(current.high - previous.close);
        const tr3 = Math.abs(current.low - previous.close);
        
        trueRanges.push(Math.max(tr1, tr2, tr3));
      }
      
      const atr = trueRanges.reduce((sum, tr) => sum + tr, 0) / period;
      atrValues.push(atr);
    }
    
    return atrValues;
  }

  /**
   * Calcula VWAP
   */
  calculateVWAP(candles) {
    let cumulativeVolume = 0;
    let cumulativeVolumePrice = 0;
    
    const vwapValues = [];
    
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      
      cumulativeVolume += candle.volume;
      cumulativeVolumePrice += typicalPrice * candle.volume;
      
      vwapValues.push(cumulativeVolumePrice / cumulativeVolume);
    }
    
    return vwapValues;
  }

  /**
   * Calcula promedio de volumen
   */
  calculateAverageVolume(volumes, period) {
    const avgVolumes = [];
    
    for (let i = period - 1; i < volumes.length; i++) {
      const recentVolumes = volumes.slice(i - period + 1, i + 1);
      const avg = recentVolumes.reduce((sum, vol) => sum + vol, 0) / period;
      avgVolumes.push(avg);
    }
    
    return avgVolumes;
  }

  /**
   * Detecta niveles significativos de soporte y resistencia
   */
  detectSignificantLevels(candles, indicators) {
    console.log('🔍 Detectando niveles S/R significativos...');
    
    const levels = [];
    const lookback = Math.min(250, Math.floor(candles.length * 0.25));
    const startIndex = candles.length - lookback;
    
    // Detectar máximos y mínimos locales
    const localExtrema = this.findLocalExtrema(candles, startIndex);
    
    // Agrupar en zonas
    const zones = this.aggregateIntoZones(localExtrema, indicators.atr10[indicators.atr10.length - 1]);
    
    // Evaluar cada zona
    for (const zone of zones) {
      const level = this.evaluateLevel(candles, zone, indicators, startIndex);
      if (level && level.score >= this.config.levelScoreMin) {
        levels.push(level);
      }
    }
    
    // Deduplicar y limitar
    const finalLevels = this.deduplicateAndLimit(levels, indicators.atr10[indicators.atr10.length - 1]);
    
    console.log(`📊 Niveles detectados: ${finalLevels.length} (${finalLevels.filter(l => l.type === 'resistance').length} resistencias, ${finalLevels.filter(l => l.type === 'support').length} soportes)`);
    
    return finalLevels;
  }

  /**
   * Encuentra máximos y mínimos locales
   */
  findLocalExtrema(candles, startIndex) {
    const extrema = [];
    
    for (let i = startIndex + 5; i < candles.length - 5; i++) {
      const current = candles[i];
      let isLocalMax = true;
      let isLocalMin = true;
      
      // Verificar si es máximo local
      for (let j = i - 5; j <= i + 5; j++) {
        if (j !== i && candles[j].high >= current.high) {
          isLocalMax = false;
          break;
        }
      }
      
      // Verificar si es mínimo local
      for (let j = i - 5; j <= i + 5; j++) {
        if (j !== i && candles[j].low <= current.low) {
          isLocalMin = false;
          break;
        }
      }
      
      if (isLocalMax) {
        extrema.push({
          type: 'resistance',
          price: current.high,
          index: i,
          timestamp: current.timestamp
        });
      }
      
      if (isLocalMin) {
        extrema.push({
          type: 'support',
          price: current.low,
          index: i,
          timestamp: current.timestamp
        });
      }
    }
    
    return extrema;
  }

  /**
   * Agrupa extremos en zonas
   */
  aggregateIntoZones(extrema, atr10) {
    const zones = [];
    const zoneWidth = Math.max(0.001, 0.4 * atr10 / 100); // 0.1% mínimo o 0.4 * ATR (reducido de 0.5)
    
    // Agrupar por tipo y proximidad
    const resistanceExtrema = extrema.filter(e => e.type === 'resistance').sort((a, b) => a.price - b.price);
    const supportExtrema = extrema.filter(e => e.type === 'support').sort((a, b) => a.price - b.price);
    
    // Agrupar resistencias
    this.groupExtremaIntoZones(resistanceExtrema, zones, 'resistance', zoneWidth);
    
    // Agrupar soportes
    this.groupExtremaIntoZones(supportExtrema, zones, 'support', zoneWidth);
    
    return zones;
  }

  /**
   * Agrupa extremos del mismo tipo en zonas
   */
  groupExtremaIntoZones(extrema, zones, type, zoneWidth) {
    for (const extremum of extrema) {
      let foundZone = false;
      
      for (const zone of zones) {
        if (zone.type === type && Math.abs(zone.price - extremum.price) / zone.price <= zoneWidth) {
          zone.points.push(extremum);
          zone.price = (zone.price * zone.points.length + extremum.price) / (zone.points.length + 1);
          foundZone = true;
          break;
        }
      }
      
      if (!foundZone) {
        zones.push({
          type,
          price: extremum.price,
          points: [extremum]
        });
      }
    }
  }

  /**
   * Evalúa un nivel S/R
   */
  evaluateLevel(candles, zone, indicators, startIndex) {
    const tests = this.countTouches(candles, zone, startIndex);
    const avgBouncePct = this.calculateAverageBounce(candles, zone, startIndex);
    const confluence = this.detectConfluence(zone, indicators);
    const score = this.calculateLevelScore(tests, avgBouncePct, confluence);
    
    // Reglas más flexibles: mantener mínimo 2 tests pero reducir bounce mínimo
    if (tests < 2 || avgBouncePct < 0.15) { // Reducido de 0.25 a 0.15
      return null; // Rechazado por reglas duras
    }
    
    return {
      type: zone.type,
      price: zone.price,
      tests,
      avgBouncePct,
      confluence,
      score
    };
  }

  /**
   * Cuenta toques a un nivel
   */
  countTouches(candles, zone, startIndex) {
    let touches = 0;
    const tolerance = zone.price * 0.002; // 0.2% de tolerancia
    
    for (let i = startIndex; i < candles.length; i++) {
      const candle = candles[i];
      
      if (zone.type === 'resistance') {
        if (Math.abs(candle.high - zone.price) <= tolerance) {
          touches++;
        }
      } else {
        if (Math.abs(candle.low - zone.price) <= tolerance) {
          touches++;
        }
      }
    }
    
    return touches;
  }

  /**
   * Calcula el rebote promedio
   */
  calculateAverageBounce(candles, zone, startIndex) {
    const bounces = [];
    const tolerance = zone.price * 0.002;
    
    for (let i = startIndex; i < candles.length; i++) {
      const candle = candles[i];
      
      if (zone.type === 'resistance') {
        if (Math.abs(candle.high - zone.price) <= tolerance) {
          const bounce = (candle.high - candle.close) / zone.price * 100;
          bounces.push(bounce);
        }
      } else {
        if (Math.abs(candle.low - zone.price) <= tolerance) {
          const bounce = (candle.close - candle.low) / zone.price * 100;
          bounces.push(bounce);
        }
      }
    }
    
    return bounces.length > 0 ? bounces.reduce((sum, bounce) => sum + bounce, 0) / bounces.length : 0;
  }

  /**
   * Detecta confluencias
   */
  detectConfluence(zone, indicators) {
    const confluences = [];
    const currentPrice = indicators.currentPrice;
    const vwap = indicators.vwap[indicators.vwap.length - 1];
    
    // VWAP confluencia
    if (Math.abs(zone.price - vwap) / zone.price <= 0.0015) {
      confluences.push('VWAP');
    }
    
    // Día alto/bajo confluencia
    if (zone.type === 'resistance' && Math.abs(zone.price - indicators.dayHigh) / zone.price <= 0.001) {
      confluences.push('DHigh');
    }
    
    if (zone.type === 'support' && Math.abs(zone.price - indicators.dayLow) / zone.price <= 0.001) {
      confluences.push('DLow');
    }
    
    return confluences;
  }

  /**
   * Calcula el score de un nivel
   */
  calculateLevelScore(tests, avgBouncePct, confluence) {
    const testScore = Math.min(tests / 3, 1) * 0.5;
    const bounceScore = Math.min(avgBouncePct / 0.5, 1) * 0.3;
    const confluenceScore = Math.min(confluence.length / 2, 1) * 0.2;
    
    return testScore + bounceScore + confluenceScore;
  }

  /**
   * Deduplica y limita niveles
   */
  deduplicateAndLimit(levels, atr10) {
    const minDistance = Math.max(this.config.minSpacing / 100, this.config.minSpacingATR * atr10 / 100);
    const maxLevels = this.config.targetFinalLevelsPerSide[1]; // 6 niveles máximo
    
    // Ordenar por score descendente
    levels.sort((a, b) => b.score - a.score);
    
    const finalLevels = [];
    
    for (const level of levels) {
      // Verificar distancia mínima
      const tooClose = finalLevels.some(existing => 
        existing.type === level.type && 
        Math.abs(existing.price - level.price) / level.price < minDistance
      );
      
      if (!tooClose) {
        finalLevels.push(level);
        
        // Limitar por tipo
        const sameType = finalLevels.filter(l => l.type === level.type);
        if (sameType.length >= maxLevels) {
          break;
        }
      }
    }
    
    return finalLevels;
  }

  /**
   * Detecta rompimientos válidos
   */
  detectBreakouts(candles, levels, indicators) {
    console.log('🔍 Detectando rompimientos válidos...');
    
    const breakouts = [];
    const atr10 = indicators.atr10[indicators.atr10.length - 1];
    
    for (const level of levels) {
      for (let i = 5; i < candles.length - 3; i++) {
        const candle = candles[i];
        const volumeRatio = candle.volume / indicators.avgVolume20[i - indicators.avgVolume20.length + candles.length - 1];
        const candleRange = (candle.high - candle.low) / candle.close;
        const atrRatio = candleRange / (atr10 / candle.close);
        
        // Verificar rompimiento
        if (this.isValidBreakout(candle, level, indicators, volumeRatio, atrRatio)) {
          const closeBeyondPct = this.calculateCloseBeyond(candle, level);
          
          // Esperar retest
          const retestResult = this.waitForRetest(candles, i, level, indicators);
          
          if (retestResult.confirmed) {
            breakouts.push({
              direction: level.type === 'resistance' ? 'UP' : 'DOWN',
              level: level, // Agregar el objeto level completo
              levelPrice: level.price,
              candle: candle, // Agregar la vela
              candleIndex: i, // Cambiar breakCandleIndex por candleIndex
              closeBeyondPct,
              volumeRatio,
              confirmed: true,
              note: retestResult.note,
              indicators: indicators // Agregar indicadores
            });
          }
        }
      }
    }
    
    console.log(`📊 Rompimientos detectados: ${breakouts.length}`);
    return breakouts;
  }

  /**
   * Verifica si es un rompimiento válido
   */
  isValidBreakout(candle, level, indicators, volumeRatio, atrRatio) {
    const closeBeyondPct = this.calculateCloseBeyond(candle, level);
    
    return closeBeyondPct >= this.config.closeBeyondPct &&
           volumeRatio >= this.config.volumeRatioMin &&
           atrRatio >= this.config.rangeMinATR;
  }

  /**
   * Calcula qué tan lejos cerró más allá del nivel
   */
  calculateCloseBeyond(candle, level) {
    if (level.type === 'resistance') {
      return (candle.close - level.price) / level.price * 100;
    } else {
      return (level.price - candle.close) / level.price * 100;
    }
  }

  /**
   * Espera retest después del rompimiento
   */
  waitForRetest(candles, breakIndex, level, indicators) {
    const maxRetestCandles = 3;
    const tolerance = level.price * 0.002;
    let consecutiveClosesOutside = 0;
    
    for (let i = breakIndex + 1; i <= Math.min(breakIndex + maxRetestCandles, candles.length - 1); i++) {
      const candle = candles[i];
      
      // Verificar si retestó la zona
      const retested = level.type === 'resistance' ? 
        candle.low <= level.price + tolerance :
        candle.high >= level.price - tolerance;
      
      if (retested) {
        // Verificar si se mantuvo fuera de la zona
        const stayedOutside = level.type === 'resistance' ?
          candle.close > level.price - tolerance :
          candle.close < level.price + tolerance;
        
        if (stayedOutside) {
          return { confirmed: true, note: 'break_retest' };
        } else {
          return { confirmed: false, note: 'fakeout' };
        }
      } else {
        // Contar cierres consecutivos fuera de la zona (más estricto)
        const closedOutside = level.type === 'resistance' ?
          candle.close > level.price + tolerance :
          candle.close < level.price - tolerance;
        
        if (closedOutside) {
          // Verificar criterios estrictos para "two closes beyond"
          const volumeRatio = this.calculateVolumeRatio(candle, indicators);
          const atrRatio = this.calculateATRRatio(candle, indicators);
          
          if (volumeRatio >= 1.30 && atrRatio >= this.config.rangeMinATR) {
            consecutiveClosesOutside++;
            if (consecutiveClosesOutside >= 2) {
              return { confirmed: true, note: 'two_closes_beyond' };
            }
          }
        } else {
          consecutiveClosesOutside = 0;
        }
      }
    }
    
    return { confirmed: false, note: 'no_retest' };
  }

  /**
   * Calcula ratio de volumen
   */
  calculateVolumeRatio(candle, indicators) {
    if (!indicators || !indicators.avgVolume || indicators.avgVolume.length === 0) {
      return 1.0; // Valor por defecto si no hay datos
    }
    const avgVolume = indicators.avgVolume[indicators.avgVolume.length - 1];
    return candle.volume / avgVolume;
  }

  /**
   * Calcula ratio ATR
   */
  calculateATRRatio(candle, indicators) {
    if (!indicators || !indicators.atr10 || indicators.atr10.length === 0) {
      return 0.5; // Valor por defecto si no hay datos
    }
    const atr10 = indicators.atr10[indicators.atr10.length - 1];
    const range = candle.high - candle.low;
    return range / atr10;
  }

  /**
   * Genera señales de trading
   */
  generateSignals(candles, levels, breakouts, indicators) {
    console.log('🔍 Generando señales de trading...');
    
    const signals = [];
    const atr10 = indicators.atr10[indicators.atr10.length - 1];
    const lastSignalIndex = -this.config.cooldownGlobal; // Para cooldown global
    const levelLastSignal = {}; // Para cooldown por nivel
    
    // Estadísticas de rechazo
    const stats = {
      candidateBreakouts: breakouts.length,
      confirmedBreakouts: 0,
      rejectedByVolume: 0,
      rejectedByRange: 0,
      rejectedByDirection: 0,
      rejectedBySpace: 0,
      rejectedByCooldown: 0,
      rejectedByRR: 0
    };
    
    // Procesar cada rompimiento confirmado
    for (const breakout of breakouts) {
      if (breakout.confirmed) {
        stats.confirmedBreakouts++;
        
        // Verificar cooldown global
        if (breakout.candleIndex - lastSignalIndex < this.config.cooldownGlobal) {
          stats.rejectedByCooldown++;
          continue;
        }
        
        // Verificar cooldown por nivel
        const levelKey = `${breakout.level.type}_${breakout.level.price}`;
        if (levelLastSignal[levelKey] && 
            breakout.candleIndex - levelLastSignal[levelKey] < this.config.cooldownPerLevel) {
          stats.rejectedByCooldown++;
          continue;
        }
        
        // Crear señal candidata
        const signal = this.createSignal(breakout, levels, atr10, indicators);
        if (!signal) continue;
        
        // Verificar filtros de calidad
        if (!this.validateSignal(signal, candles, levels, atr10, stats)) {
          continue;
        }
        
        // Calcular score de breakout
        signal.breakoutScore = this.calculateBreakoutScore(signal, breakout, atr10);
        
        signals.push(signal);
        levelLastSignal[levelKey] = breakout.candleIndex;
      }
    }
    
    // Ordenar por score y limitar
    signals.sort((a, b) => b.breakoutScore - a.breakoutScore);
    const finalSignals = signals.slice(0, this.config.maxSignalsPerWindow);
    
    console.log(`📈 Señales generadas: ${finalSignals.length}/${signals.length} candidatas`);
    console.log(`📊 Rechazos: Vol=${stats.rejectedByVolume}, Rango=${stats.rejectedByRange}, Dir=${stats.rejectedByDirection}, Esp=${stats.rejectedBySpace}, Cooldown=${stats.rejectedByCooldown}, RR=${stats.rejectedByRR}`);
    
    return finalSignals;
  }

  /**
   * Crea una señal de trading
   */
  createSignal(breakout, levels, atr10, indicators) {
    const candle = breakout.candle;
    const level = breakout.level;
    
    // Determinar dirección basada en el tipo de nivel
    const direction = level.type === 'resistance' ? 'LONG' : 'SHORT';
    
    // Calcular entry, SL y TP
    const entry = candle.close;
    const sl = this.calculateStopLoss(entry, level, direction, atr10);
    const tp1 = this.calculateTakeProfit1(entry, level, direction, atr10, levels);
    const tp2 = this.calculateTakeProfit2(entry, level, direction, atr10, levels);
    
    // Verificar que SL esté en el lado correcto
    if ((direction === 'LONG' && sl >= entry) || (direction === 'SHORT' && sl <= entry)) {
      return null;
    }
    
    return {
      type: 'BREAK_RETEST',
      direction,
      entry,
      sl,
      tp1,
      tp2,
      level: level.price,
      breakoutIndex: breakout.candleIndex,
      reasons: this.getSignalReasons(breakout, indicators)
    };
  }

  /**
   * Valida una señal de trading
   */
  validateSignal(signal, candles, levels, atr10, stats) {
    // Verificar espacio para TP
    const expectedMove = Math.abs(signal.tp1 - signal.entry) / signal.entry * 100;
    if (expectedMove > this.config.expectedMoveMax) {
      stats.rejectedBySpace++;
      return false;
    }
    
    // Verificar distancia a zona opuesta
    const oppositeLevels = levels.filter(l => l.type !== signal.level.type);
    for (const oppLevel of oppositeLevels) {
      const distance = Math.abs(signal.entry - oppLevel.price) / signal.entry * 100;
      if (distance <= this.config.oppositeZoneMin) {
        stats.rejectedBySpace++;
        return false;
      }
    }
    
    // Verificar ratio riesgo/beneficio
    const risk = Math.abs(signal.entry - signal.sl) / signal.entry * 100;
    const reward = Math.abs(signal.tp1 - signal.entry) / signal.entry * 100;
    const rr = reward / risk;
    
    if (rr < this.config.rrMin) {
      stats.rejectedByRR++;
      return false;
    }
    
    return true;
  }

  /**
   * Calcula el score de breakout
   */
  calculateBreakoutScore(signal, breakout, atr10) {
    const levelScore = breakout.level.score;
    const closeBeyondPct = this.calculateCloseBeyond(breakout.candle, breakout.level);
    const volumeRatio = this.calculateVolumeRatio(breakout.candle, breakout.indicators);
    const atrRatio = this.calculateATRRatio(breakout.candle, breakout.indicators);
    
    const closeBeyondNorm = Math.min(closeBeyondPct / 0.30, 1.0);
    const volumeRatioNorm = Math.min(volumeRatio / 1.6, 1.0);
    const atrRatioNorm = Math.min(atrRatio / 0.6, 1.0);
    
    return 0.35 * levelScore + 
           0.30 * closeBeyondNorm + 
           0.25 * volumeRatioNorm + 
           0.10 * atrRatioNorm;
  }

  /**
   * Calcula Stop Loss
   */
  calculateStopLoss(entry, level, direction, atr10) {
    if (direction === 'LONG') {
      return Math.min(entry - 0.15, level.price - 0.05);
    } else {
      return Math.max(entry + 0.15, level.price + 0.05);
    }
  }

  /**
   * Calcula Take Profit 1
   */
  calculateTakeProfit1(entry, level, direction, atr10, levels) {
    const atrTarget = direction === 'LONG' ? 
      entry + (0.6 * atr10) : 
      entry - (0.6 * atr10);
    
    // Buscar siguiente nivel
    const nextLevels = levels.filter(l => l.type !== level.type);
    if (nextLevels.length > 0) {
      const nextLevel = nextLevels.reduce((closest, current) => {
        const currentDist = Math.abs(current.price - entry);
        const closestDist = Math.abs(closest.price - entry);
        return currentDist < closestDist ? current : closest;
      });
      
      if (direction === 'LONG' && nextLevel.price > entry) {
        return Math.min(atrTarget, nextLevel.price);
      } else if (direction === 'SHORT' && nextLevel.price < entry) {
        return Math.max(atrTarget, nextLevel.price);
      }
    }
    
    return atrTarget;
  }

  /**
   * Calcula Take Profit 2
   */
  calculateTakeProfit2(entry, level, direction, atr10, levels) {
    const atrTarget = direction === 'LONG' ? 
      entry + (1.0 * atr10) : 
      entry - (1.0 * atr10);
    
    // Limitar a máximo 2*ATR para evitar targets irreales
    const maxTarget = direction === 'LONG' ? 
      entry + (2.0 * atr10) : 
      entry - (2.0 * atr10);
    
    return direction === 'LONG' ? 
      Math.min(atrTarget, maxTarget) : 
      Math.max(atrTarget, maxTarget);
  }

  /**
   * Obtiene las razones de la señal
   */
  getSignalReasons(breakout, indicators) {
    const reasons = ['breakoutConfirmed'];
    
    const volumeRatio = this.calculateVolumeRatio(breakout.candle, indicators);
    const closeBeyond = this.calculateCloseBeyond(breakout.candle, breakout.level);
    
    if (volumeRatio >= this.config.volumeRatioMin) {
      reasons.push(`volumeRatio>=${volumeRatio.toFixed(2)}`);
    }
    if (closeBeyond >= this.config.closeBeyondPct) {
      reasons.push(`closeBeyond>=${closeBeyond.toFixed(2)}%`);
    }
    
    return reasons;
  }

  /**
   * Genera señal de bounce
   */
  generateBounceSignal(candles, level, indicators) {
    const currentCandle = candles[candles.length - 1];
    const tolerance = level.price * 0.002;
    
    // Verificar si hay bounce reciente
    const recentBounce = level.type === 'resistance' ?
      currentCandle.high >= level.price - tolerance && currentCandle.close < level.price + tolerance :
      currentCandle.low <= level.price + tolerance && currentCandle.close > level.price - tolerance;
    
    if (!recentBounce) return null;
    
    // Verificar volumen
    const volumeRatio = currentCandle.volume / indicators.avgVolume20[indicators.avgVolume20.length - 1];
    if (volumeRatio < 0.9) return null;
    
    // Verificar espacio para TP
    const nextOppositeLevel = this.findNextOppositeLevel(level, indicators);
    if (nextOppositeLevel) {
      const space = Math.abs(nextOppositeLevel.price - level.price) / level.price;
      if (space < 0.002) return null; // Menos de 0.2% de espacio
    }
    
    // Calcular SL y TP
    const sl = level.type === 'resistance' ? 
      level.price * 1.0012 : // 0.12% arriba de resistencia
      level.price * 0.9988;   // 0.12% abajo de soporte
    
    const tp1 = level.type === 'resistance' ?
      level.price * 0.9985 :  // 0.15% abajo de resistencia
      level.price * 1.0015;   // 0.15% arriba de soporte
    
    const tp2 = nextOppositeLevel ? nextOppositeLevel.price : tp1 * 1.5;
    
    return {
      kind: 'bounce',
      direction: level.type === 'resistance' ? 'DOWN' : 'UP',
      entry: currentCandle.close,
      sl,
      tp1,
      tp2,
      reason: [
        `srScore>=${level.score.toFixed(2)}`,
        `volume>${volumeRatio.toFixed(2)}`,
        `closeBeyond>0.15%`
      ]
    };
  }

  /**
   * Genera señal de break & retest
   */
  generateBreakSignal(candles, breakout, levels, indicators) {
    const currentCandle = candles[candles.length - 1];
    
    // Verificar que el retest se mantuvo
    if (!breakout.confirmed || breakout.note !== 'break_retest') {
      return null;
    }
    
    // Calcular SL y TP
    const sl = breakout.direction === 'UP' ?
      breakout.levelPrice * 0.998 :  // 0.2% abajo de resistencia rota
      breakout.levelPrice * 1.002;   // 0.2% arriba de soporte roto
    
    const tp1 = breakout.direction === 'UP' ?
      breakout.levelPrice * 1.003 :  // 0.3% arriba de resistencia rota
      breakout.levelPrice * 0.997;   // 0.3% abajo de soporte roto
    
    const tp2 = tp1 * 1.5;
    
    return {
      kind: 'break_retest',
      direction: breakout.direction,
      entry: currentCandle.close,
      sl,
      tp1,
      tp2,
      reason: [
        `breakoutConfirmed`,
        `volumeRatio>=${breakout.volumeRatio.toFixed(2)}`,
        `closeBeyond>=${breakout.closeBeyondPct.toFixed(2)}%`
      ]
    };
  }

  /**
   * Encuentra el siguiente nivel opuesto
   */
  findNextOppositeLevel(level, indicators) {
    // Esta es una implementación simplificada
    // En una implementación completa, buscarías en los niveles detectados
    return null;
  }

  /**
   * Calcula estadísticas
   */
  calculateStats(levels, breakouts, signals) {
    const candidateLevels = levels.length;
    const finalLevels = levels.length;
    const confirmedBreakouts = breakouts.filter(b => b.confirmed).length;
    const signalsTotal = signals.length;
    
    return {
      candidateLevels,
      finalLevels,
      confirmedBreakouts,
      signalsTotal,
      rejectedBySpacing: 0,
      rejectedByQuality: 0,
      rejectedByScore: 0,
      rejectedByBreakoutVolume: 0,
      rejectedNoRetest: 0,
      rejectedByDirection: 0,
      rejectedBySpace: 0,
      rejectedByCooldown: 0,
      rejectedByRR: 0
    };
  }

  /**
   * Registra resultados
   */
  logResults(result) {
    console.log('\n📊 RESULTADOS DE DETECCIÓN S/R:');
    console.log('='.repeat(50));
    
    console.log(`\n🎯 NIVELES DETECTADOS (${result.levels.length}):`);
    result.levels.forEach((level, i) => {
      console.log(`${i + 1}. ${level.type.toUpperCase()} - $${level.price.toFixed(2)}`);
      console.log(`   Tests: ${level.tests}, Bounce: ${level.avgBouncePct.toFixed(2)}%, Score: ${level.score.toFixed(2)}`);
      console.log(`   Confluencias: ${level.confluence.join(', ') || 'Ninguna'}`);
    });
    
    console.log(`\n🚀 ROMPIMIENTOS DETECTADOS (${result.breakouts.length}):`);
    result.breakouts.forEach((breakout, i) => {
      console.log(`${i + 1}. ${breakout.direction} - $${breakout.levelPrice.toFixed(2)}`);
      console.log(`   Volumen: ${breakout.volumeRatio.toFixed(2)}x, Cierre: ${breakout.closeBeyondPct.toFixed(2)}%`);
      console.log(`   Confirmado: ${breakout.confirmed}, Nota: ${breakout.note}`);
    });
    
    console.log(`\n📈 SEÑALES GENERADAS (${result.signals.length}):`);
    result.signals.forEach((signal, i) => {
      console.log(`${i + 1}. ${signal.kind.toUpperCase()} ${signal.direction}`);
      console.log(`   Entry: $${signal.entry.toFixed(2)}, SL: $${signal.sl.toFixed(2)}`);
      console.log(`   TP1: $${signal.tp1.toFixed(2)}, TP2: $${signal.tp2.toFixed(2)}`);
      console.log(`   Razones: ${signal.reason.join(', ')}`);
    });
    
    console.log(`\n📊 ESTADÍSTICAS:`);
    console.log(`Candidatos: ${result.stats.candidateLevels}`);
    console.log(`Finales: ${result.stats.finalLevels}`);
    console.log(`Rechazados por espaciado: ${result.stats.rejectedBySpacing}`);
    console.log(`Rechazados por calidad: ${result.stats.rejectedByQuality}`);
  }
}

// Función principal para probar
async function main() {
  const detector = new SRDetector();
  
  try {
    await detector.connect();
    
    // Probar con 1000 velas
    console.log('🧪 Probando detección S/R con 1000 velas...');
    const result1000 = await detector.detectSRAndBreakouts(false);
    
    // Probar con 100K velas
    console.log('\n🧪 Probando detección S/R con 100K velas...');
    const result100K = await detector.detectSRAndBreakouts(true);
    
  } catch (error) {
    console.error('❌ Error en main:', error);
  } finally {
    await detector.disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SRDetector;
