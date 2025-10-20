#!/usr/bin/env node
const assert = require('assert');

// Import functions to test
const { 
  enforceRRMinimum, 
  calculateAbsPercentages, 
  calculateSignedPercentages,
  evaluateExitWithTieResolution,
  calculateCostsAndROI,
  calculateQuantiles
} = require('../hardened-utils');

// Test RR minimum enforcement
function testRRMinimumEnforcement() {
  console.log('Testing RR minimum enforcement...');
  
  // Test case 1: RR already meets minimum
  const result1 = enforceRRMinimum('LONG', 100, 95, 110, 1.30);
  assert.strictEqual(result1.tp1, 110);
  assert.strictEqual(result1.rr_real, 2.0);
  assert.strictEqual(result1.tp1Recalc, false);
  
  // Test case 2: RR below minimum, needs recalculation
  const result2 = enforceRRMinimum('LONG', 100, 95, 98, 1.30);
  assert.strictEqual(result2.tp1, 106.5); // 5 * 1.30 = 6.5, so 100 + 6.5 = 106.5
  assert.strictEqual(result2.rr_real, 1.30);
  assert.strictEqual(result2.tp1Recalc, true);
  
  // Test case 3: SHORT side
  const result3 = enforceRRMinimum('SHORT', 100, 105, 95, 1.30);
  assert.strictEqual(result3.tp1, 93.5); // 5 * 1.30 = 6.5, so 100 - 6.5 = 93.5
  assert.strictEqual(result3.rr_real, 1.30);
  assert.strictEqual(result3.tp1Recalc, true);
  
  console.log('✓ RR minimum enforcement tests passed');
}

// Test percentage calculations
function testPercentageCalculations() {
  console.log('Testing percentage calculations...');
  
  // Test absolute percentages
  const abs1 = calculateAbsPercentages('LONG', 100, 95, 110, 120);
  assert.strictEqual(abs1.slPctAbs, 5.0); // |95-100|/100 * 100
  assert.strictEqual(abs1.tp1PctAbs, 10.0); // |110-100|/100 * 100
  assert.strictEqual(abs1.tp2PctAbs, 20.0); // |120-100|/100 * 100
  
  const abs2 = calculateAbsPercentages('SHORT', 100, 105, 95, 90);
  assert.strictEqual(abs2.slPctAbs, 5.0); // |105-100|/100 * 100
  assert.strictEqual(abs2.tp1PctAbs, 5.0); // |95-100|/100 * 100
  assert.strictEqual(abs2.tp2PctAbs, 10.0); // |90-100|/100 * 100
  
  // Test signed percentages
  const signed1 = calculateSignedPercentages('LONG', 100, 95, 110);
  assert.strictEqual(signed1.tp1PctSigned, 10.0); // (110-100)/100 * 100
  assert.strictEqual(signed1.slPctSigned, -5.0); // (95-100)/100 * 100
  
  const signed2 = calculateSignedPercentages('SHORT', 100, 105, 95);
  assert.strictEqual(signed2.tp1PctSigned, 5.0); // (100-95)/100 * 100
  assert.strictEqual(signed2.slPctSigned, 5.0); // (105-100)/100 * 100
  
  console.log('✓ Percentage calculation tests passed');
}

// Test tie resolution
function testTieResolution() {
  console.log('Testing tie resolution...');
  
  // Test case 1: LONG with tie (High >= TP1 and Low <= SL in same bar)
  const window1 = [
    { high: 110, low: 95 }, // Both TP and SL hit
    { high: 108, low: 98 },
    { high: 106, low: 100 },
    { high: 104, low: 102 },
    { high: 102, low: 100 }
  ];
  
  const result1 = evaluateExitWithTieResolution('LONG', 100, 95, 110, window1);
  assert.strictEqual(result1.exit.exit_reason, 'SL');
  assert.strictEqual(result1.exit.exit_price, 95);
  assert.strictEqual(result1.exit.bars_to_exit, 1);
  assert.strictEqual(result1.tieCase, true);
  assert.strictEqual(result1.tieResolved, 'SL');
  
  // Test case 2: SHORT with tie (Low <= TP1 and High >= SL in same bar)
  const window2 = [
    { high: 105, low: 90 }, // Both TP and SL hit
    { high: 103, low: 92 },
    { high: 101, low: 94 },
    { high: 99, low: 96 },
    { high: 97, low: 95 }
  ];
  
  const result2 = evaluateExitWithTieResolution('SHORT', 100, 105, 90, window2);
  assert.strictEqual(result2.exit.exit_reason, 'SL');
  assert.strictEqual(result2.exit.exit_price, 105);
  assert.strictEqual(result2.exit.bars_to_exit, 1);
  assert.strictEqual(result2.tieCase, true);
  assert.strictEqual(result2.tieResolved, 'SL');
  
  // Test case 3: TP hit first
  const window3 = [
    { high: 110, low: 98 }, // Only TP hit
    { high: 108, low: 96 },
    { high: 106, low: 94 },
    { high: 104, low: 92 },
    { high: 102, low: 90 }
  ];
  
  const result3 = evaluateExitWithTieResolution('LONG', 100, 95, 110, window3);
  assert.strictEqual(result3.exit.exit_reason, 'TP');
  assert.strictEqual(result3.exit.exit_price, 110);
  assert.strictEqual(result3.exit.bars_to_exit, 1);
  assert.strictEqual(result3.tieCase, false);
  assert.strictEqual(result3.tieResolved, null);
  
  // Test case 4: EXP (neither hit)
  const window4 = [
    { high: 108, low: 98, close: 105 },
    { high: 106, low: 96, close: 101 },
    { high: 104, low: 96, close: 100 }, // low=96 > sl=95, so no SL hit
    { high: 102, low: 98, close: 99 },
    { high: 99, low: 97, close: 97 } // Neither TP (110) nor SL (95) hit
  ];
  
  const result4 = evaluateExitWithTieResolution('LONG', 100, 95, 110, window4);
  assert.strictEqual(result4.exit.exit_reason, 'EXP');
  assert.strictEqual(result4.exit.exit_price, 97); // Close of bar 5
  assert.strictEqual(result4.exit.bars_to_exit, 5);
  assert.strictEqual(result4.tieCase, false);
  assert.strictEqual(result4.tieResolved, null);
  
  console.log('✓ Tie resolution tests passed');
}

// Test costs and ROI calculations
function testCostsAndROI() {
  console.log('Testing costs and ROI calculations...');
  
  // Test LONG with positive gross
  const costs1 = calculateCostsAndROI(0.05); // 5% gross
  assert(Math.abs(costs1.net_pct_taker - 4.88) < 0.01); // 5% - 0.12% = 4.88%
  assert(Math.abs(costs1.net_pct_maker - 4.94) < 0.01); // 5% - 0.06% = 4.94%
  assert(Math.abs(costs1.net_usd_taker - 4000 * 0.0488) < 0.01); // 4000 * 4.88%
  assert(Math.abs(costs1.net_usd_maker - 4000 * 0.0494) < 0.01); // 4000 * 4.94%
  assert(Math.abs(costs1.roi_on_capital_taker - (4000 * 0.0488 / 400) * 100) < 0.01); // 48.8%
  assert(Math.abs(costs1.roi_on_capital_maker - (4000 * 0.0494 / 400) * 100) < 0.01); // 49.4%
  
  // Test SHORT with negative gross
  const costs2 = calculateCostsAndROI(-0.03); // -3% gross
  assert(Math.abs(costs2.net_pct_taker - (-3.12)) < 0.01); // -3% - 0.12% = -3.12%
  assert(Math.abs(costs2.net_pct_maker - (-3.06)) < 0.01); // -3% - 0.06% = -3.06%
  assert(Math.abs(costs2.net_usd_taker - (4000 * -0.0312)) < 0.01); // 4000 * -3.12%
  assert(Math.abs(costs2.net_usd_maker - (4000 * -0.0306)) < 0.01); // 4000 * -3.06%
  
  console.log('✓ Costs and ROI calculation tests passed');
}

// Test quantile calculations
function testQuantileCalculations() {
  console.log('Testing quantile calculations...');
  
  // Test with even number of elements
  const q1 = calculateQuantiles([1, 2, 3, 4, 5, 6]);
  assert.strictEqual(q1.p25, 2.25);
  assert.strictEqual(q1.p50, 3.5);
  assert.strictEqual(q1.p75, 4.75);
  
  // Test with odd number of elements
  const q2 = calculateQuantiles([1, 2, 3, 4, 5]);
  assert.strictEqual(q2.p25, 2);
  assert.strictEqual(q2.p50, 3);
  assert.strictEqual(q2.p75, 4);
  
  // Test with single element
  const q3 = calculateQuantiles([5]);
  assert.strictEqual(q3.p25, 5);
  assert.strictEqual(q3.p50, 5);
  assert.strictEqual(q3.p75, 5);
  
  // Test with empty array
  const q4 = calculateQuantiles([]);
  assert.strictEqual(q4.p25, null);
  assert.strictEqual(q4.p50, null);
  assert.strictEqual(q4.p75, null);
  
  console.log('✓ Quantile calculation tests passed');
}

// Test consistency assertions
function testConsistencyAssertions() {
  console.log('Testing consistency assertions...');
  
  // Test RR consistency
  const absPcts = calculateAbsPercentages('LONG', 100, 95, 110);
  const rrReal = 2.0; // (110-100)/(100-95) = 10/5 = 2
  const calculatedRR = absPcts.tp1PctAbs / absPcts.slPctAbs; // 10/5 = 2
  assert.strictEqual(Math.abs(calculatedRR - rrReal) < 1e-6, true);
  
  console.log('✓ Consistency assertion tests passed');
}

// Run all tests
function runAllTests() {
  console.log('Running hardened reporting tests...\n');
  
  try {
    testRRMinimumEnforcement();
    testPercentageCalculations();
    testTieResolution();
    testCostsAndROI();
    testQuantileCalculations();
    testConsistencyAssertions();
    
    console.log('\n✅ All hardened reporting tests passed!');
    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
