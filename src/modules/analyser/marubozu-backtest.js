/**
 * Marubozu Analyzer Backtest System
 * 
 * Integrates with the existing pattern backtest system to test
 * the Marubozu Follow Score Analyzer on historical data
 */

const { analyzeMarubozu } = require('./marubozu-analyzer');
const { telemetry } = require('./marubozu-telemetry');

/**
 * Run backtest for Marubozu Analyzer
 * @param {Array} candles - Historical candles
 * @param {Object} options - Backtest options
 * @returns {Object} Backtest results
 */
function runMarubozuBacktest(candles, options = {}) {
  const {
    minScore = 7,           // Minimum score to consider trade
    minRR = 1.2,           // Minimum risk/reward ratio
    evaluationCandles = 5, // Candles to evaluate after signal
    stopLossPercent = 0.01, // 1% stop loss
    takeProfitPercent = 0.01 // 1% take profit
  } = options;

  console.log('🎯 Starting Marubozu Analyzer Backtest...');
  console.log(`📊 Analyzing ${candles.length} candles`);
  console.log(`🎯 Min Score: ${minScore}, Min RR: ${minRR}`);
  console.log(`⏱️  Evaluation: ${evaluationCandles} candles, SL/TP: ${(stopLossPercent * 100)}%\n`);

  const results = [];
  let totalSignals = 0;
  let validSignals = 0;
  let tradesExecuted = 0;

  // Scan for marubozu patterns
  for (let i = 20; i < candles.length - evaluationCandles; i++) {
    const currentCandle = candles[i];
    
    // Check if current candle is a potential marubozu
    if (!isPotentialMarubozu(currentCandle)) continue;
    
    totalSignals++;
    
    // Get historical context
    const historicalCandles = candles.slice(Math.max(0, i - 50), i + 1);
    
    try {
      // Analyze marubozu
      const analysis = analyzeMarubozu({
        candles: historicalCandles,
        config: {
          atrLen: 14,
          volLookback: 20,
          percentileLookback: 200
        }
      });

      // Record in telemetry
      telemetry.record(analysis, {
        timestamp: currentCandle.timestamp,
        index: i,
        price: currentCandle.close
      });

      // Check if signal meets criteria
      if (analysis.score.score >= minScore && 
          analysis.score.decision === 'FOLLOW' && 
          analysis.isValid && 
          analysis.targets.rrToTp1 >= minRR) {
        
        validSignals++;
        
        // Execute backtest trade
        const tradeResult = executeMarubozuTrade(
          analysis, 
          currentCandle, 
          candles.slice(i + 1, i + 1 + evaluationCandles),
          { stopLossPercent, takeProfitPercent }
        );
        
        if (tradeResult) {
          tradesExecuted++;
          results.push({
            index: i,
            timestamp: currentCandle.timestamp,
            candle: currentCandle,
            analysis,
            trade: tradeResult
          });
        }
      }
    } catch (error) {
      console.error(`❌ Error analyzing candle at index ${i}:`, error.message);
    }
  }

  // Generate statistics
  const stats = generateMarubozuBacktestStats(results);
  
  console.log('\n📈 MARUBOZU BACKTEST RESULTS');
  console.log('================================');
  console.log(`Total Signals Detected: ${totalSignals}`);
  console.log(`Valid Signals (Score ≥ ${minScore}): ${validSignals}`);
  console.log(`Trades Executed: ${tradesExecuted}`);
  console.log(`Win Rate: ${stats.winRate.toFixed(1)}%`);
  console.log(`Total P&L: ${stats.totalPnL > 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}%`);
  console.log(`Average Win: ${stats.avgWin.toFixed(2)}%`);
  console.log(`Average Loss: ${stats.avgLoss.toFixed(2)}%`);
  console.log(`Best Trade: ${stats.bestTrade.toFixed(2)}%`);
  console.log(`Worst Trade: ${stats.worstTrade.toFixed(2)}%`);
  
  // Print score distribution
  console.log('\n📊 Score Distribution:');
  const scoreRanges = {
    '7-8': 0,
    '8-9': 0,
    '9-10': 0
  };
  
  results.forEach(result => {
    const score = result.analysis.score.score;
    if (score >= 7 && score < 8) scoreRanges['7-8']++;
    else if (score >= 8 && score < 9) scoreRanges['8-9']++;
    else if (score >= 9) scoreRanges['9-10']++;
  });
  
  Object.entries(scoreRanges).forEach(([range, count]) => {
    if (count > 0) {
      console.log(`  ${range}: ${count} trades`);
    }
  });

  return {
    results,
    stats,
    totalSignals,
    validSignals,
    tradesExecuted,
    telemetry: telemetry.getMetrics()
  };
}

/**
 * Check if candle is a potential marubozu
 * @param {Object} candle - Candle to check
 * @returns {boolean} Whether candle is potential marubozu
 */
function isPotentialMarubozu(candle) {
  const bodySize = Math.abs(candle.close - candle.open);
  const totalRange = candle.high - candle.low;
  
  if (totalRange === 0) return false;
  
  const bodyPct = bodySize / totalRange;
  return bodyPct >= 0.85; // Lower threshold for initial screening
}

/**
 * Execute a marubozu trade
 * @param {Object} analysis - Analysis result
 * @param {Object} signalCandle - Signal candle
 * @param {Array} evaluationCandles - Candles to evaluate
 * @param {Object} options - Trade options
 * @returns {Object|null} Trade result or null if no trade
 */
function executeMarubozuTrade(analysis, signalCandle, evaluationCandles, options) {
  const { stopLossPercent, takeProfitPercent } = options;
  const { score, targets } = analysis;
  
  const entryPrice = signalCandle.close;
  const isBullish = score.direction === 'BULLISH';
  
  // Use analyzer targets or fallback to simple SL/TP
  let sl, tp;
  
  if (targets && targets.sl && targets.tp1) {
    sl = targets.sl;
    tp = targets.tp1;
  } else {
    // Fallback to simple SL/TP
    if (isBullish) {
      sl = entryPrice * (1 - stopLossPercent);
      tp = entryPrice * (1 + takeProfitPercent);
    } else {
      sl = entryPrice * (1 + stopLossPercent);
      tp = entryPrice * (1 - takeProfitPercent);
    }
  }
  
  // Evaluate subsequent candles
  for (let i = 0; i < evaluationCandles.length; i++) {
    const candle = evaluationCandles[i];
    const { high, low, close } = candle;
    
    let result = null;
    let exitPrice = 0;
    let exitReason = '';
    
    if (isBullish) {
      // Check TP first (more favorable)
      if (high >= tp) {
        result = 'WIN';
        exitPrice = tp;
        exitReason = 'TP_HIT';
      }
      // Then check SL
      else if (low <= sl) {
        result = 'LOSS';
        exitPrice = sl;
        exitReason = 'SL_HIT';
      }
    } else {
      // Check TP first
      if (low <= tp) {
        result = 'WIN';
        exitPrice = tp;
        exitReason = 'TP_HIT';
      }
      // Then check SL
      else if (high >= sl) {
        result = 'LOSS';
        exitPrice = sl;
        exitReason = 'SL_HIT';
      }
    }
    
    if (result) {
      const pnl = calculatePnL(entryPrice, exitPrice, isBullish);
      
      return {
        entryPrice,
        exitPrice,
        sl,
        tp,
        result,
        exitReason,
        pnl,
        candlesEvaluated: i + 1,
        exitTimestamp: candle.timestamp,
        score: score.score,
        decision: score.decision,
        rr: targets ? targets.rrToTp1 : (takeProfitPercent / stopLossPercent)
      };
    }
  }
  
  // No SL/TP hit - calculate P&L at end of evaluation period
  const lastCandle = evaluationCandles[evaluationCandles.length - 1];
  const pnl = calculatePnL(entryPrice, lastCandle.close, isBullish);
  
  return {
    entryPrice,
    exitPrice: lastCandle.close,
    sl,
    tp,
    result: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'FLAT',
    exitReason: 'EVALUATION_END',
    pnl,
    candlesEvaluated: evaluationCandles.length,
    exitTimestamp: lastCandle.timestamp,
    score: score.score,
    decision: score.decision,
    rr: targets ? targets.rrToTp1 : (takeProfitPercent / stopLossPercent)
  };
}

/**
 * Calculate P&L
 * @param {number} entry - Entry price
 * @param {number} exit - Exit price
 * @param {boolean} isBullish - Trade direction
 * @returns {number} P&L percentage
 */
function calculatePnL(entry, exit, isBullish) {
  if (isBullish) {
    return ((exit - entry) / entry) * 100;
  } else {
    return ((entry - exit) / entry) * 100;
  }
}

/**
 * Generate backtest statistics
 * @param {Array} results - Trade results
 * @returns {Object} Statistics
 */
function generateMarubozuBacktestStats(results) {
  if (results.length === 0) {
    return {
      winRate: 0,
      totalPnL: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: 0,
      worstTrade: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0
    };
  }
  
  const wins = results.filter(r => r.trade.result === 'WIN');
  const losses = results.filter(r => r.trade.result === 'LOSS');
  const winRate = (wins.length / results.length) * 100;
  
  const totalPnL = results.reduce((sum, r) => sum + r.trade.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((sum, r) => sum + r.trade.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((sum, r) => sum + r.trade.pnl, 0) / losses.length : 0;
  
  const pnls = results.map(r => r.trade.pnl);
  const bestTrade = Math.max(...pnls);
  const worstTrade = Math.min(...pnls);
  
  return {
    winRate,
    totalPnL,
    avgWin,
    avgLoss,
    bestTrade,
    worstTrade,
    totalTrades: results.length,
    wins: wins.length,
    losses: losses.length
  };
}

/**
 * Generate detailed backtest report
 * @param {Object} backtestResult - Backtest result
 * @returns {string} Report text
 */
function generateMarubozuBacktestReport(backtestResult) {
  const { results, stats, totalSignals, validSignals, tradesExecuted } = backtestResult;
  
  let report = 'MARUBOZU ANALYZER BACKTEST REPORT\n';
  report += '===================================\n\n';
  
  report += `Total Signals Detected: ${totalSignals}\n`;
  report += `Valid Signals (Score ≥ 7): ${validSignals}\n`;
  report += `Trades Executed: ${tradesExecuted}\n\n`;
  
  report += `Win Rate: ${stats.winRate.toFixed(1)}%\n`;
  report += `Total P&L: ${stats.totalPnL > 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}%\n`;
  report += `Average Win: ${stats.avgWin.toFixed(2)}%\n`;
  report += `Average Loss: ${stats.avgLoss.toFixed(2)}%\n`;
  report += `Best Trade: ${stats.bestTrade.toFixed(2)}%\n`;
  report += `Worst Trade: ${stats.worstTrade.toFixed(2)}%\n\n`;
  
  report += 'TOP 10 TRADES:\n';
  report += '==============\n';
  
  const sortedResults = results
    .sort((a, b) => b.trade.pnl - a.trade.pnl)
    .slice(0, 10);
  
  sortedResults.forEach((result, index) => {
    const trade = result.trade;
    const date = new Date(result.timestamp).toISOString().split('T')[0];
    
    report += `${index + 1}. ${date} - Score: ${trade.score.toFixed(2)} - ${trade.result} - ${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)}%\n`;
  });
  
  return report;
}

module.exports = {
  runMarubozuBacktest,
  generateMarubozuBacktestReport,
  generateMarubozuBacktestStats
};
