/**
 * Marubozu Analyzer Integration Example
 * 
 * This example demonstrates how to integrate the Marubozu Analyzer
 * into a trading system with real-time analysis and telemetry.
 */

const { analyzeMarubozu } = require('./marubozu-analyzer');
const { telemetry } = require('./marubozu-telemetry');

/**
 * Example trading system integration
 */
class MarubozuTradingSystem {
  constructor() {
    this.candles = [];
    this.book = null;
    this.htf = null;
    this.activeTrades = [];
    this.config = {
      maxCandles: 1000,
      minScoreForTrade: 7,
      minRR: 1.2
    };
  }

  /**
   * Add new candle to the system
   * @param {Object} candle - New candle data
   */
  addCandle(candle) {
    this.candles.push(candle);
    
    // Keep only recent candles
    if (this.candles.length > this.config.maxCandles) {
      this.candles.shift();
    }
    
    // Analyze for marubozu patterns
    this.analyzeMarubozu();
  }

  /**
   * Update order book
   * @param {Object} book - Order book snapshot
   */
  updateBook(book) {
    this.book = book;
  }

  /**
   * Update higher timeframe context
   * @param {Object} htf - HTF context
   */
  updateHTF(htf) {
    this.htf = htf;
  }

  /**
   * Analyze current candle for marubozu pattern
   */
  analyzeMarubozu() {
    if (this.candles.length < 20) return;

    const currentCandle = this.candles[this.candles.length - 1];
    
    // Check if current candle is a potential marubozu
    if (!this.isPotentialMarubozu(currentCandle)) return;

    console.log(`🔍 Analyzing potential marubozu at ${new Date(currentCandle.timestamp).toISOString()}`);

    try {
      const result = analyzeMarubozu({
        candles: this.candles,
        book: this.book,
        htf: this.htf,
        config: {
          atrLen: 14,
          volLookback: 20,
          percentileLookback: 200
        }
      });

      // Record in telemetry
      telemetry.record(result, {
        timestamp: currentCandle.timestamp,
        price: currentCandle.close
      });

      // Log analysis result
      this.logAnalysisResult(result, currentCandle);

      // Check if we should execute a trade
      if (this.shouldExecuteTrade(result)) {
        this.executeTrade(result, currentCandle);
      }

    } catch (error) {
      console.error('❌ Marubozu analysis failed:', error.message);
    }
  }

  /**
   * Check if candle is a potential marubozu
   * @param {Object} candle - Candle to check
   * @returns {boolean} Whether candle is potential marubozu
   */
  isPotentialMarubozu(candle) {
    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;
    
    // Basic marubozu criteria
    const bodyPct = totalRange > 0 ? bodySize / totalRange : 0;
    const hasStrongBody = bodyPct >= 0.85; // Lower threshold for initial screening
    
    return hasStrongBody;
  }

  /**
   * Log analysis result
   * @param {Object} result - Analysis result
   * @param {Object} candle - Current candle
   */
  logAnalysisResult(result, candle) {
    const { score, targets, isValid } = result;
    
    console.log(`📊 Marubozu Analysis Result:`);
    console.log(`   Direction: ${score.direction}`);
    console.log(`   Score: ${score.score.toFixed(2)}/10`);
    console.log(`   Decision: ${score.decision}`);
    console.log(`   Body %: ${(score.bodyPct * 100).toFixed(1)}%`);
    console.log(`   TR/ATR: ${score.trOverAtr.toFixed(2)}`);
    console.log(`   Volume Z: ${score.volZ.toFixed(2)}`);
    console.log(`   Structure Break: ${score.structureBroke ? '✅' : '❌'}`);
    console.log(`   HTF Aligned: ${score.htfAligned ? '✅' : '❌'}`);
    console.log(`   Valid: ${isValid ? '✅' : '❌'}`);
    
    if (targets) {
      console.log(`   SL: ${targets.sl.toFixed(2)}`);
      console.log(`   TP1: ${targets.tp1.toFixed(2)} (RR: ${targets.rrToTp1.toFixed(2)})`);
      console.log(`   TP2: ${targets.tp2.toFixed(2)} (RR: ${targets.rrToTp2.toFixed(2)})`);
    }
    
    if (score.invalidation.retraceOver50 || score.invalidation.backInsideRange) {
      console.log(`   ⚠️  Invalidation: ${score.invalidation.reason}`);
    }
    
    console.log('');
  }

  /**
   * Check if trade should be executed
   * @param {Object} result - Analysis result
   * @returns {boolean} Whether to execute trade
   */
  shouldExecuteTrade(result) {
    const { score, targets, isValid } = result;
    
    // Must meet minimum criteria
    if (!isValid) return false;
    if (score.score < this.config.minScoreForTrade) return false;
    if (targets.rrToTp1 < this.config.minRR) return false;
    if (score.decision !== 'FOLLOW') return false;
    
    // Check for invalidations
    if (score.invalidation.retraceOver50 || score.invalidation.backInsideRange) {
      return false;
    }
    
    return true;
  }

  /**
   * Execute trade
   * @param {Object} result - Analysis result
   * @param {Object} candle - Entry candle
   */
  executeTrade(result, candle) {
    const { score, targets } = result;
    
    const trade = {
      id: `marubozu_${Date.now()}`,
      direction: score.direction.toLowerCase(),
      entryPrice: candle.close,
      entryTime: candle.timestamp,
      sl: targets.sl,
      tp1: targets.tp1,
      tp2: targets.tp2,
      trailing: targets.trailing,
      score: score.score,
      rr: targets.rrToTp1,
      status: 'ACTIVE'
    };
    
    this.activeTrades.push(trade);
    
    console.log(`🚀 EXECUTING TRADE:`);
    console.log(`   ID: ${trade.id}`);
    console.log(`   Direction: ${trade.direction.toUpperCase()}`);
    console.log(`   Entry: ${trade.entryPrice.toFixed(2)}`);
    console.log(`   SL: ${trade.sl.toFixed(2)}`);
    console.log(`   TP1: ${trade.tp1.toFixed(2)}`);
    console.log(`   TP2: ${trade.tp2.toFixed(2)}`);
    console.log(`   Score: ${trade.score.toFixed(2)}/10`);
    console.log(`   RR: ${trade.rr.toFixed(2)}`);
    console.log('');
  }

  /**
   * Update active trades
   * @param {Object} currentCandle - Current market candle
   */
  updateTrades(currentCandle) {
    this.activeTrades = this.activeTrades.filter(trade => {
      const hit = this.checkTradeHit(trade, currentCandle);
      
      if (hit) {
        this.closeTrade(trade, hit, currentCandle);
        return false; // Remove from active trades
      }
      
      return true; // Keep active
    });
  }

  /**
   * Check if trade hit SL or TP
   * @param {Object} trade - Trade to check
   * @param {Object} candle - Current candle
   * @returns {Object|null} Hit result or null
   */
  checkTradeHit(trade, candle) {
    const { high, low, close } = candle;
    
    if (trade.direction === 'bullish') {
      // Check TP1
      if (high >= trade.tp1 && !trade.tp1Hit) {
        return { type: 'TP1', price: trade.tp1 };
      }
      
      // Check TP2
      if (high >= trade.tp2 && trade.tp1Hit) {
        return { type: 'TP2', price: trade.tp2 };
      }
      
      // Check SL
      if (low <= trade.sl) {
        return { type: 'SL', price: trade.sl };
      }
    } else {
      // Check TP1
      if (low <= trade.tp1 && !trade.tp1Hit) {
        return { type: 'TP1', price: trade.tp1 };
      }
      
      // Check TP2
      if (low <= trade.tp2 && trade.tp1Hit) {
        return { type: 'TP2', price: trade.tp2 };
      }
      
      // Check SL
      if (high >= trade.sl) {
        return { type: 'SL', price: trade.sl };
      }
    }
    
    return null;
  }

  /**
   * Close trade
   * @param {Object} trade - Trade to close
   * @param {Object} hit - Hit result
   * @param {Object} candle - Current candle
   */
  closeTrade(trade, hit, candle) {
    const pnl = this.calculatePnL(trade, hit.price);
    
    console.log(`💰 TRADE CLOSED:`);
    console.log(`   ID: ${trade.id}`);
    console.log(`   Exit: ${hit.type} at ${hit.price.toFixed(2)}`);
    console.log(`   P&L: ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}%`);
    console.log(`   Duration: ${candle.timestamp - trade.entryTime}ms`);
    console.log('');
    
    // Record trade result in telemetry
    telemetry.recordTrade({
      trade,
      hit,
      pnl,
      duration: candle.timestamp - trade.entryTime
    });
  }

  /**
   * Calculate P&L
   * @param {Object} trade - Trade
   * @param {number} exitPrice - Exit price
   * @returns {number} P&L percentage
   */
  calculatePnL(trade, exitPrice) {
    const entryPrice = trade.entryPrice;
    
    if (trade.direction === 'bullish') {
      return ((exitPrice - entryPrice) / entryPrice) * 100;
    } else {
      return ((entryPrice - exitPrice) / entryPrice) * 100;
    }
  }

  /**
   * Get system statistics
   * @returns {Object} System stats
   */
  getStats() {
    return {
      totalCandles: this.candles.length,
      activeTrades: this.activeTrades.length,
      telemetry: telemetry.getMetrics()
    };
  }

  /**
   * Print system status
   */
  printStatus() {
    const stats = this.getStats();
    console.log(`📈 MARUBOZU TRADING SYSTEM STATUS`);
    console.log(`   Candles: ${stats.totalCandles}`);
    console.log(`   Active Trades: ${stats.activeTrades.length}`);
    console.log(`   Total Analyses: ${stats.telemetry.totalAnalyses}`);
    console.log(`   Follow Rate: ${stats.telemetry.followRate}%`);
    console.log(`   Avg Score: ${stats.telemetry.avgScore.toFixed(2)}`);
    console.log('');
  }
}

/**
 * Example usage
 */
function runExample() {
  console.log('🚀 Starting Marubozu Trading System Example...\n');
  
  const system = new MarubozuTradingSystem();
  
  // Simulate adding candles
  const basePrice = 100;
  const candles = [];
  
  // Create some historical candles
  for (let i = 0; i < 50; i++) {
    const price = basePrice + (Math.random() - 0.5) * 10;
    const candle = {
      open: price,
      high: price + Math.random() * 2,
      low: price - Math.random() * 2,
      close: price + (Math.random() - 0.5) * 1,
      volume: 1000 + Math.random() * 500,
      timestamp: Date.now() - (50 - i) * 900000 // 15min intervals
    };
    candles.push(candle);
  }
  
  // Add candles to system
  candles.forEach(candle => {
    system.addCandle(candle);
  });
  
  // Simulate order book
  const book = {
    bids: [
      { price: '99.5', qty: '100' },
      { price: '99.4', qty: '150' }
    ],
    asks: [
      { price: '100.5', qty: '80' },
      { price: '100.6', qty: '120' }
    ]
  };
  system.updateBook(book);
  
  // Simulate HTF context
  const htf = {
    ema20: 99.8,
    ema50: 99.5,
    bias: 'UP'
  };
  system.updateHTF(htf);
  
  // Add a strong marubozu candle
  const marubozuCandle = {
    open: 100,
    high: 102.1,
    low: 99.9,
    close: 102.0, // Strong bullish marubozu
    volume: 2500, // High volume
    timestamp: Date.now()
  };
  
  system.addCandle(marubozuCandle);
  
  // Print final status
  system.printStatus();
  
  // Print telemetry
  telemetry.printMetrics();
  
  console.log('✅ Example completed!');
}

// Export for use in other modules
module.exports = {
  MarubozuTradingSystem,
  runExample
};

// Run example if this file is executed directly
if (require.main === module) {
  runExample();
}
