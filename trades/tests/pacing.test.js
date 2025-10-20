const assert = require('assert');
const { applyPacingRules, calculatePacingIntervals, PACING_CONFIG } = require('../pacing');

console.log('🧪 Running Pacing System TDD Tests...\n');

// Test data setup
const createMockCandles = (count) => {
  const candles = [];
  const startTime = 1760107500000; // Base timestamp
  for (let i = 0; i < count; i++) {
    candles.push({
      openTime: startTime + (i * 15 * 60 * 1000), // 15 minutes apart
      open: 4000 + i,
      high: 4010 + i,
      low: 3990 + i,
      close: 4005 + i,
      volume: 1000
    });
  }
  return candles;
};

const createMockSignal = (candleIndex, side = 'LONG') => ({
  id: `test-${candleIndex}`,
  dtISO: new Date(1760107500000 + (candleIndex * 15 * 60 * 1000)).toISOString(),
  side,
  entry: 4000,
  sl: 3950,
  tp1: 4100,
  rr: 1.0
});

// Test 1: Min spacing 1h (4 bars)
console.log('1. Testing Min Spacing (1h = 4 bars)...');
const candles1 = createMockCandles(10);
const candidates1 = [
  createMockSignal(0, 'LONG'),  // Bar 0
  createMockSignal(2, 'SHORT'), // Bar 2 (only 2 bars apart, should be rejected)
  createMockSignal(5, 'LONG')   // Bar 5 (5 bars apart, should pass)
];

const result1 = applyPacingRules(candidates1, candles1, []);
assert.strictEqual(result1.picked.length, 2, 'Should pick 2 signals');
assert.strictEqual(result1.rejected.length, 1, 'Should reject 1 signal');
assert.strictEqual(result1.pacingStats.removedByMinSpacing, 1, 'Should reject 1 by min spacing');
assert.strictEqual(result1.rejected[0].pacingRejectionReason, 'minSpacing', 'Rejection reason should be minSpacing');
console.log('✅ Min Spacing test passed\n');

// Test 2: Cooldown by side (15m = 1 bar)
console.log('2. Testing Cooldown by Side (15m = 1 bar)...');
const candles2 = createMockCandles(20);
const candidates2 = [
  createMockSignal(0, 'LONG'),  // Bar 0
  createMockSignal(4, 'LONG'), // Bar 4 (4 bars apart, same side - should pass min spacing)
  createMockSignal(17, 'SHORT') // Bar 17 (outside 4h window - should pass rate limit)
];

const result2 = applyPacingRules(candidates2, candles2, []);
assert.strictEqual(result2.picked.length, 3, 'Should pick 3 signals');
assert.strictEqual(result2.rejected.length, 0, 'Should reject 0 signals');
console.log('✅ Cooldown by Side test passed\n');

// Test 2b: Cooldown by side rejection
console.log('2b. Testing Cooldown by Side Rejection...');
const candles2b = createMockCandles(20);
const candidates2b = [
  createMockSignal(0, 'LONG'),  // Bar 0
  createMockSignal(0, 'LONG'), // Bar 0 (same bar, same side - should be rejected by sameBar)
  createMockSignal(4, 'LONG'), // Bar 4 (4 bars apart, same side - should pass)
  createMockSignal(17, 'SHORT') // Bar 17 (different side - should pass)
];

const result2b = applyPacingRules(candidates2b, candles2b, []);
assert.strictEqual(result2b.picked.length, 3, 'Should pick 3 signals');
assert.strictEqual(result2b.rejected.length, 1, 'Should reject 1 signal');
assert.strictEqual(result2b.pacingStats.removedBySameBar, 1, 'Should reject 1 by same bar');
console.log('✅ Cooldown by Side Rejection test passed\n');

// Test 3: Rate limit 4h (max 2 signals per 4h window)
console.log('3. Testing Rate Limit 4h (max 2 signals per 4h window)...');
const candles3 = createMockCandles(20);
const candidates3 = [
  createMockSignal(0, 'LONG'),   // Bar 0
  createMockSignal(4, 'SHORT'), // Bar 4 (within 4h window, should pass)
  createMockSignal(8, 'LONG'),  // Bar 8 (within 4h window, should be rejected by rate limit)
  createMockSignal(17, 'SHORT') // Bar 17 (outside 4h window, should pass)
];

const result3 = applyPacingRules(candidates3, candles3, []);
assert.strictEqual(result3.picked.length, 3, 'Should pick 3 signals');
assert.strictEqual(result3.rejected.length, 1, 'Should reject 1 signal');
assert.strictEqual(result3.pacingStats.removedByRateLimit4h, 1, 'Should reject 1 by rate limit');
assert.strictEqual(result3.rejected[0].pacingRejectionReason, 'rateLimit4h', 'Rejection reason should be rateLimit4h');
console.log('✅ Rate Limit 4h test passed\n');

// Test 4: Anti-reverse after SL (6 bars)
console.log('4. Testing Anti-Reverse after SL (6 bars)...');
const candles4 = createMockCandles(20);
const emittedSignals4 = [
  {
    ...createMockSignal(0, 'LONG'),
    exit_reason: 'SL' // Last signal closed by SL
  }
];

const candidates4 = [
  createMockSignal(3, 'SHORT'),  // Bar 3 (reverse side, within 6 bars - should be rejected)
  createMockSignal(17, 'SHORT')  // Bar 17 (reverse side, outside 6 bars and 4h window - should pass)
];

const result4 = applyPacingRules(candidates4, candles4, emittedSignals4);
assert.strictEqual(result4.picked.length, 1, 'Should pick 1 signal');
assert.strictEqual(result4.rejected.length, 1, 'Should reject 1 signal');
assert.strictEqual(result4.pacingStats.blockedReverseAfterSL, 1, 'Should reject 1 by anti-reverse');
assert.strictEqual(result4.rejected[0].pacingRejectionReason, 'reverseAfterSL', 'Rejection reason should be reverseAfterSL');
console.log('✅ Anti-Reverse after SL test passed\n');

// Test 5: Pacing intervals calculation
console.log('5. Testing Pacing Intervals Calculation...');
const candles5 = createMockCandles(10);
const signals5 = [
  createMockSignal(0, 'LONG'),
  createMockSignal(4, 'SHORT'),  // 4 bars = 60 minutes
  createMockSignal(8, 'LONG')    // 4 bars = 60 minutes
];

const signalsWithIntervals = calculatePacingIntervals(signals5, candles5);
assert.strictEqual(signalsWithIntervals[0].intervalFromPrevious, null, 'First signal should have null interval');
assert.strictEqual(signalsWithIntervals[1].intervalFromPrevious, 60, 'Second signal should have 60 minutes interval');
assert.strictEqual(signalsWithIntervals[2].intervalFromPrevious, 60, 'Third signal should have 60 minutes interval');
console.log('✅ Pacing Intervals test passed\n');

// Test 6: Configuration constants
console.log('6. Testing Configuration Constants...');
assert.strictEqual(PACING_CONFIG.minSpacingBars, 4, 'Min spacing should be 4 bars');
assert.strictEqual(PACING_CONFIG.cooldownSideBars, 1, 'Cooldown side should be 1 bar');
assert.strictEqual(PACING_CONFIG.maxSignals4h, 2, 'Max signals 4h should be 2');
assert.strictEqual(PACING_CONFIG.antiReverseBars, 6, 'Anti-reverse should be 6 bars');
assert.strictEqual(PACING_CONFIG.window4hBars, 16, '4h window should be 16 bars');
console.log('✅ Configuration Constants test passed\n');

console.log('🎉 All Pacing System TDD Tests PASSED!');
