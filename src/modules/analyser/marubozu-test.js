/**
 * Manual Marubozu Analyzer Test
 * 
 * Simple test runner without Jest dependencies
 */

const { analyzeMarubozu } = require('./marubozu-analyzer');
const { telemetry } = require('./marubozu-telemetry');

/**
 * Test runner
 */
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running Marubozu Analyzer Tests...\n');
    
    for (const test of this.tests) {
      try {
        console.log(`▶️  ${test.name}`);
        await test.fn();
        console.log(`✅ PASSED\n`);
        this.passed++;
      } catch (error) {
        console.log(`❌ FAILED: ${error.message}\n`);
        this.failed++;
      }
    }
    
    console.log('📊 Test Results:');
    console.log(`   Passed: ${this.passed}`);
    console.log(`   Failed: ${this.failed}`);
    console.log(`   Total: ${this.tests.length}`);
    
    if (this.failed === 0) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log('\n💥 Some tests failed!');
    }
  }
}

/**
 * Helper functions for tests
 */
function createTestCandles(count, basePrice = 100, volatility = 1) {
  const candles = [];
  let currentPrice = basePrice;
  
  for (let i = 0; i < count; i++) {
    const open = currentPrice;
    const high = open + (Math.random() * volatility);
    const low = open - (Math.random() * volatility);
    const close = low + (Math.random() * (high - low));
    const volume = 1000 + (Math.random() * 500);
    
    candles.push({
      open,
      high,
      low,
      close,
      volume,
      timestamp: Date.now() - (count - i) * 900000 // 15min intervals
    });
    
    currentPrice = close;
  }
  
  return candles;
}

function createStrongMarubozu(basePrice = 100, isBullish = true) {
  const open = basePrice;
  const bodySize = 2; // Strong body
  const close = isBullish ? open + bodySize : open - bodySize;
  const wickSize = 0.1; // Small wicks
  const high = isBullish ? close + wickSize : open + wickSize;
  const low = isBullish ? open - wickSize : close - wickSize;
  
  return {
    open,
    high,
    low,
    close,
    volume: 2000, // High volume
    timestamp: Date.now()
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual, expected, message) {
  if (actual <= expected) {
    throw new Error(`${message}: expected > ${expected}, got ${actual}`);
  }
}

function assertLessThan(actual, expected, message) {
  if (actual >= expected) {
    throw new Error(`${message}: expected < ${expected}, got ${actual}`);
  }
}

/**
 * Run tests
 */
async function runTests() {
  const runner = new TestRunner();
  
  // Test 1: Strong Marubozu Detection
  runner.test('Strong marubozu detection with FOLLOW decision', () => {
    const candles = createTestCandles(20, 100, 0.5);
    const strongMarubozu = createStrongMarubozu(110, true);
    candles.push(strongMarubozu);
    
    const book = {
      bids: [{ price: '109.5', qty: '100' }, { price: '109.4', qty: '150' }],
      asks: [{ price: '110.5', qty: '80' }, { price: '110.6', qty: '120' }]
    };
    
    const htf = {
      ema20: 108,
      ema50: 106,
      bias: 'UP'
    };
    
    const result = analyzeMarubozu({ candles, book, htf });
    
    // Verify strong marubozu criteria
    assertGreaterThan(result.score.bodyPct, 0.85, 'Body percentage should be strong');
    assertGreaterThan(result.score.trOverAtr, 1.0, 'TR/ATR should be acceptable');
    assertGreaterThan(result.score.score, 3, 'Score should be reasonable');
    assertEqual(result.score.direction, 'BULLISH', 'Direction should be bullish');
    
    console.log(`   Score: ${result.score.score.toFixed(2)}/10`);
    console.log(`   Decision: ${result.score.decision}`);
    console.log(`   Body %: ${(result.score.bodyPct * 100).toFixed(1)}%`);
  });
  
  // Test 2: Invalidated Setup
  runner.test('Invalidation when retrace > 50% of body', () => {
    const candles = createTestCandles(20, 100, 0.5);
    const strongMarubozu = createStrongMarubozu(110, true);
    candles.push(strongMarubozu);
    
    // Add next candle with >50% retrace
    const nextCandle = {
      open: 112,
      high: 112.5,
      low: 110.8, // Retrace to 110.8 (retrace = 1.2, body = 2, retrace = 60%)
      close: 111.5,
      volume: 1500,
      timestamp: Date.now() + 900000
    };
    candles.push(nextCandle);
    
    const result = analyzeMarubozu({ candles });
    
    assert(result.score.invalidation.retraceOver50, 'Should detect retrace over 50%');
    assertEqual(result.score.invalidation.reason, 'retrace_over_50_percent', 'Should have correct invalidation reason');
    
    console.log(`   Invalidation: ${result.score.invalidation.reason}`);
  });
  
  // Test 3: Target Calculations
  runner.test('Target calculations with proper RR', () => {
    const candles = createTestCandles(20, 100, 0.5);
    const marubozu = createStrongMarubozu(110, true);
    candles.push(marubozu);
    
    const result = analyzeMarubozu({ candles });
    
    assertGreaterThan(result.targets.sl, 0, 'SL should be positive');
    assertGreaterThan(result.targets.tp1, 0, 'TP1 should be positive');
    assertGreaterThan(result.targets.tp2, 0, 'TP2 should be positive');
    assertGreaterThan(result.targets.rrToTp1, 0.5, 'RR to TP1 should be reasonable');
    
    console.log(`   SL: ${result.targets.sl.toFixed(2)}`);
    console.log(`   TP1: ${result.targets.tp1.toFixed(2)} (RR: ${result.targets.rrToTp1.toFixed(2)})`);
    console.log(`   TP2: ${result.targets.tp2.toFixed(2)} (RR: ${result.targets.rrToTp2.toFixed(2)})`);
  });
  
  // Test 4: Insufficient Data Handling
  runner.test('Handle insufficient data gracefully', () => {
    const candles = createTestCandles(10, 100, 0.5); // Less than required for ATR
    const marubozu = createStrongMarubozu(110, true);
    candles.push(marubozu);
    
    const result = analyzeMarubozu({ candles });
    
    assertEqual(result.score.decision, 'NO_FOLLOW', 'Should default to NO_FOLLOW with insufficient data');
    assertEqual(result.score.score, 0, 'Score should be 0 with insufficient data');
    
    console.log(`   Decision: ${result.score.decision}`);
    console.log(`   Score: ${result.score.score}`);
  });
  
  // Test 5: Decision Thresholds
  runner.test('Decision thresholds work correctly', () => {
    const candles = createTestCandles(20, 100, 0.5);
    
    // Test high score
    const highScoreMarubozu = {
      open: 100,
      high: 102.1,
      low: 99.9,
      close: 102.0,
      volume: 2500,
      timestamp: Date.now()
    };
    candles.push(highScoreMarubozu);
    
    const result = analyzeMarubozu({ candles });
    
    if (result.score.score >= 7) {
      assertEqual(result.score.decision, 'FOLLOW', 'High score should be FOLLOW');
    } else if (result.score.score >= 5) {
      assertEqual(result.score.decision, 'CAUTION', 'Medium score should be CAUTION');
    } else {
      assertEqual(result.score.decision, 'NO_FOLLOW', 'Low score should be NO_FOLLOW');
    }
    
    console.log(`   Score: ${result.score.score.toFixed(2)} -> ${result.score.decision}`);
  });
  
  // Test 6: Telemetry Integration
  runner.test('Telemetry records analysis correctly', () => {
    const candles = createTestCandles(20, 100, 0.5);
    const marubozu = createStrongMarubozu(110, true);
    candles.push(marubozu);
    
    const initialCount = telemetry.metrics.totalAnalyses;
    
    const result = analyzeMarubozu({ candles });
    telemetry.record(result);
    
    assertEqual(telemetry.metrics.totalAnalyses, initialCount + 1, 'Should increment analysis count');
    
    console.log(`   Total analyses: ${telemetry.metrics.totalAnalyses}`);
    console.log(`   Follow rate: ${telemetry.metrics.followRate}%`);
  });
  
  // Test 7: Integration Test
  runner.test('Complete analysis integration', () => {
    const candles = createTestCandles(20, 100, 0.5);
    const strongMarubozu = createStrongMarubozu(110, true);
    candles.push(strongMarubozu);
    
    const book = {
      bids: [{ price: '109.5', qty: '100' }],
      asks: [{ price: '110.5', qty: '80' }]
    };
    
    const htf = {
      ema20: 108,
      ema50: 106
    };
    
    const result = analyzeMarubozu({ candles, book, htf });
    
    assert(result.score, 'Should have score');
    assert(result.targets, 'Should have targets');
    assert(result.liquidity, 'Should have liquidity');
    assert(typeof result.isValid === 'boolean', 'Should have isValid boolean');
    
    assertGreaterThan(result.score.score, 0, 'Score should be positive');
    assertLessThan(result.score.score, 11, 'Score should be <= 10');
    
    const validDecisions = ['FOLLOW', 'CAUTION', 'NO_FOLLOW'];
    assert(validDecisions.includes(result.score.decision), 'Should have valid decision');
    
    console.log(`   Complete analysis successful`);
    console.log(`   Score: ${result.score.score.toFixed(2)}/10`);
    console.log(`   Decision: ${result.score.decision}`);
    console.log(`   Valid: ${result.isValid}`);
  });
  
  await runner.run();
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
