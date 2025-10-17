/**
 * Test Marubozu Backtest System
 * 
 * Tests the Marubozu Analyzer backtest system with existing data
 */

const { runMarubozuBacktest, generateMarubozuBacktestReport } = require('./marubozu-backtest');
const { telemetry } = require('./marubozu-telemetry');

/**
 * Create sample historical data for testing
 */
function createSampleData() {
  console.log('📊 Creating sample historical data...');
  
  const candles = [];
  const basePrice = 100;
  const volatility = 2;
  
  // Create 1000 candles with some marubozu patterns
  for (let i = 0; i < 1000; i++) {
    let open, high, low, close, volume;
    
    // Create some marubozu patterns at specific intervals
    if (i % 50 === 0 && i > 100) {
      // Strong bullish marubozu
      open = basePrice + (i * 0.1);
      close = open + 3; // Very strong body
      high = close + 0.05; // Very small upper wick
      low = open - 0.05; // Very small lower wick
      volume = 3500; // Very high volume
    } else if (i % 75 === 0 && i > 100) {
      // Strong bearish marubozu
      open = basePrice + (i * 0.1);
      close = open - 3; // Very strong body
      high = open + 0.05; // Very small upper wick
      low = close - 0.05; // Very small lower wick
      volume = 3500; // Very high volume
    } else {
      // Regular candle
      open = basePrice + (i * 0.05) + (Math.random() - 0.5) * volatility;
      const bodySize = (Math.random() - 0.5) * volatility;
      close = open + bodySize;
      high = Math.max(open, close) + Math.random() * 1;
      low = Math.min(open, close) - Math.random() * 1;
      volume = 1000 + Math.random() * 500;
    }
    
    candles.push({
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.round(volume),
      timestamp: Date.now() - (1000 - i) * 900000 // 15min intervals going back
    });
  }
  
  console.log(`✅ Created ${candles.length} candles`);
  return candles;
}

/**
 * Test different backtest configurations
 */
async function testMarubozuBacktest() {
  console.log('🚀 Testing Marubozu Backtest System\n');
  
  // Reset telemetry
  telemetry.reset();
  
  // Create sample data
  const candles = createSampleData();
  
  // Test 1: Conservative settings
  console.log('📈 Test 1: Conservative Settings (Score ≥ 8, RR ≥ 1.5)');
  console.log('='.repeat(60));
  
  const conservativeResult = runMarubozuBacktest(candles, {
    minScore: 8,
    minRR: 1.5,
    evaluationCandles: 5,
    stopLossPercent: 0.01,
    takeProfitPercent: 0.01
  });
  
  console.log('\n📈 Test 2: Standard Settings (Score ≥ 7, RR ≥ 1.2)');
  console.log('='.repeat(60));
  
  // Reset telemetry for second test
  telemetry.reset();
  
  const standardResult = runMarubozuBacktest(candles, {
    minScore: 7,
    minRR: 1.2,
    evaluationCandles: 5,
    stopLossPercent: 0.01,
    takeProfitPercent: 0.01
  });
  
  console.log('\n📈 Test 3: Aggressive Settings (Score ≥ 6, RR ≥ 1.0)');
  console.log('='.repeat(60));
  
  // Reset telemetry for third test
  telemetry.reset();
  
  const aggressiveResult = runMarubozuBacktest(candles, {
    minScore: 6,
    minRR: 1.0,
    evaluationCandles: 5,
    stopLossPercent: 0.01,
    takeProfitPercent: 0.01
  });
  
  // Compare results
  console.log('\n📊 COMPARISON OF BACKTEST CONFIGURATIONS');
  console.log('==========================================');
  
  const configs = [
    { name: 'Conservative', result: conservativeResult },
    { name: 'Standard', result: standardResult },
    { name: 'Aggressive', result: aggressiveResult }
  ];
  
  console.log('Config'.padEnd(12) + 'Trades'.padEnd(8) + 'Win Rate'.padEnd(10) + 'Total P&L'.padEnd(12) + 'Avg Win'.padEnd(10) + 'Avg Loss');
  console.log('-'.repeat(70));
  
  configs.forEach(config => {
    const { stats, tradesExecuted } = config.result;
    console.log(
      config.name.padEnd(12) +
      tradesExecuted.toString().padEnd(8) +
      `${stats.winRate.toFixed(1)}%`.padEnd(10) +
      `${stats.totalPnL > 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}%`.padEnd(12) +
      `${stats.avgWin.toFixed(2)}%`.padEnd(10) +
      `${stats.avgLoss.toFixed(2)}%`
    );
  });
  
  // Generate detailed report for best configuration
  const bestConfig = configs.reduce((best, current) => 
    current.result.stats.totalPnL > best.result.stats.totalPnL ? current : best
  );
  
  console.log(`\n🏆 Best Configuration: ${bestConfig.name}`);
  console.log('='.repeat(40));
  
  const report = generateMarubozuBacktestReport(bestConfig.result);
  console.log(report);
  
  // Print telemetry for best configuration
  console.log('\n📊 TELEMETRY SUMMARY');
  console.log('====================');
  telemetry.printMetrics();
  
  return {
    conservative: conservativeResult,
    standard: standardResult,
    aggressive: aggressiveResult,
    best: bestConfig
  };
}

/**
 * Test with real market data simulation
 */
function testWithMarketSimulation() {
  console.log('\n🌍 Testing with Market Simulation');
  console.log('='.repeat(40));
  
  // Create more realistic market data
  const candles = [];
  let price = 100;
  const trend = 0.0001; // Slight upward trend
  
  for (let i = 0; i < 500; i++) {
    // Add trend
    price += trend;
    
    // Add some volatility
    const volatility = 0.02;
    const randomWalk = (Math.random() - 0.5) * volatility;
    price += randomWalk;
    
    // Create candle
    const open = price;
    const close = price + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * 0.01;
    const low = Math.min(open, close) - Math.random() * 0.01;
    
    // Add some volume spikes
    let volume = 1000 + Math.random() * 1000;
    if (i % 30 === 0) volume *= 2; // Volume spike every 30 candles
    
    candles.push({
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.round(volume),
      timestamp: Date.now() - (500 - i) * 900000
    });
    
    price = close;
  }
  
  console.log(`📊 Created ${candles.length} realistic candles`);
  
  // Run backtest with standard settings
  const result = runMarubozuBacktest(candles, {
    minScore: 7,
    minRR: 1.2,
    evaluationCandles: 5
  });
  
  return result;
}

/**
 * Main test function
 */
async function runTests() {
  try {
    console.log('🧪 MARUBOZU BACKTEST SYSTEM TESTS');
    console.log('==================================\n');
    
    // Test 1: Basic backtest functionality
    await testMarubozuBacktest();
    
    // Test 2: Market simulation
    testWithMarketSimulation();
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  testMarubozuBacktest,
  testWithMarketSimulation,
  runTests
};
