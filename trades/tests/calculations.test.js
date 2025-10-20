const assert = require('assert');

// Test utilities for calculation functions
function calculateLongRiskReward(entry, sl, tp1) {
  const risk_abs = entry - sl;
  const reward_abs = tp1 - entry;
  const rr = reward_abs / risk_abs;
  const slPct = (sl / entry - 1) * 100;
  const tp1Pct = (tp1 / entry - 1) * 100;
  return { risk_abs, reward_abs, rr, slPct, tp1Pct };
}

function calculateShortRiskReward(entry, sl, tp1) {
  const risk_abs = sl - entry;
  const reward_abs = entry - tp1;
  const rr = reward_abs / risk_abs;
  const slPct = (sl / entry - 1) * 100; // For SHORT: SL > entry, so this should be positive
  const tp1Pct = (entry - tp1) / entry * 100; // For SHORT: entry > tp1, so this should be positive
  return { risk_abs, reward_abs, rr, slPct, tp1Pct };
}

function calculatePnLAndROI(entry, tp1, side, capital = 400, leverage = 10, isTaker = true) {
  const nocional = capital * leverage;
  const roundTripBps = isTaker ? 10 : 4; // 0.10% vs 0.04%
  const slippageBps = 2; // 0.02%
  
  let pnlBruto;
  if (side === 'LONG') {
    pnlBruto = nocional * ((tp1 - entry) / entry);
  } else {
    pnlBruto = nocional * ((entry - tp1) / entry);
  }
  
  const fees = nocional * (roundTripBps / 10000);
  const slippage = nocional * (slippageBps / 10000);
  const pnlNeto = pnlBruto - fees - slippage;
  const roiNeto = pnlNeto / capital;
  
  return { pnlBruto, fees, slippage, pnlNeto, roiNeto };
}

// Unit tests
function testLongCalculations() {
  console.log('Testing LONG calculations...');
  
  const entry = 1000;
  const sl = 950;
  const tp1 = 1100;
  
  const result = calculateLongRiskReward(entry, sl, tp1);
  
  assert(result.risk_abs > 0, 'LONG risk_abs must be positive');
  assert(result.reward_abs > 0, 'LONG reward_abs must be positive');
  assert(result.rr > 0, 'LONG RR must be positive');
  assert(result.slPct < 0, 'LONG SL% must be negative');
  assert(result.tp1Pct > 0, 'LONG TP1% must be positive');
  assert(result.rr === 2, `Expected RR=2, got ${result.rr}`);
  assert(Math.abs(result.slPct - (-5)) < 0.01, `Expected SL%≈-5, got ${result.slPct}`);
  assert(Math.abs(result.tp1Pct - 10) < 0.01, `Expected TP1%≈10, got ${result.tp1Pct}`);
  
  console.log('✓ LONG calculations passed');
}

function testShortCalculations() {
  console.log('Testing SHORT calculations...');
  
  const entry = 1000;
  const sl = 1050;
  const tp1 = 900;
  
  const result = calculateShortRiskReward(entry, sl, tp1);
  
  assert(result.risk_abs > 0, 'SHORT risk_abs must be positive');
  assert(result.reward_abs > 0, 'SHORT reward_abs must be positive');
  assert(result.rr > 0, 'SHORT RR must be positive');
  assert(result.slPct > 0, 'SHORT SL% must be positive');
  assert(result.tp1Pct > 0, 'SHORT TP1% must be positive');
  assert(result.rr === 2, `Expected RR=2, got ${result.rr}`);
  assert(Math.abs(result.slPct - 5) < 0.01, `Expected SL%≈5, got ${result.slPct}`);
  assert(Math.abs(result.tp1Pct - 10) < 0.01, `Expected TP1%≈10, got ${result.tp1Pct}`);
  
  console.log('✓ SHORT calculations passed');
}

function testPnLAndROI() {
  console.log('Testing P&L and ROI calculations...');
  
  const entry = 1000;
  const tp1 = 1010; // 1% move
  const capital = 400;
  const leverage = 10;
  const nocional = capital * leverage;
  
  // LONG test
  const longResult = calculatePnLAndROI(entry, tp1, 'LONG', capital, leverage, true);
  const expectedPnlBruto = nocional * 0.01; // 1% of 4000 = 40
  const expectedFees = nocional * 0.001; // 0.10% of 4000 = 4
  const expectedSlippage = nocional * 0.0002; // 0.02% of 4000 = 0.8
  const expectedPnlNeto = expectedPnlBruto - expectedFees - expectedSlippage; // 40 - 4 - 0.8 = 35.2
  const expectedROI = expectedPnlNeto / capital; // 35.2 / 400 = 0.088 = 8.8%
  
  assert(Math.abs(longResult.pnlBruto - expectedPnlBruto) < 0.01, `Expected PnL bruto ~40, got ${longResult.pnlBruto}`);
  assert(Math.abs(longResult.fees - expectedFees) < 0.01, `Expected fees ~4, got ${longResult.fees}`);
  assert(Math.abs(longResult.slippage - expectedSlippage) < 0.01, `Expected slippage ~0.8, got ${longResult.slippage}`);
  assert(Math.abs(longResult.pnlNeto - expectedPnlNeto) < 0.01, `Expected PnL neto ~35.2, got ${longResult.pnlNeto}`);
  assert(longResult.roiNeto < 0.1, `ROI should be <10% for 1% move, got ${longResult.roiNeto * 100}%`);
  
  // SHORT test
  const shortResult = calculatePnLAndROI(entry, tp1, 'SHORT', capital, leverage, true);
  assert(Math.abs(shortResult.pnlBruto - (-expectedPnlBruto)) < 0.01, 'SHORT PnL should be negative of LONG');
  
  console.log('✓ P&L and ROI calculations passed');
}

function testNoFixedRR() {
  console.log('Testing no fixed RR values...');
  
  const testCases = [
    { entry: 1000, sl: 950, tp1: 1100, side: 'LONG' }, // RR = 2
    { entry: 1000, sl: 980, tp1: 1020, side: 'LONG' }, // RR = 1
    { entry: 1000, sl: 1050, tp1: 900, side: 'SHORT' }, // RR = 2
    { entry: 1000, sl: 1040, tp1: 960, side: 'SHORT' }  // RR = 1
  ];
  
  const rrs = testCases.map(tc => {
    if (tc.side === 'LONG') {
      return calculateLongRiskReward(tc.entry, tc.sl, tc.tp1).rr;
    } else {
      return calculateShortRiskReward(tc.entry, tc.sl, tc.tp1).rr;
    }
  });
  
  // Check that not all RRs are the same
  const uniqueRRs = new Set(rrs.map(rr => Math.round(rr * 100) / 100));
  assert(uniqueRRs.size > 1, 'All RRs should not be identical');
  
  console.log('✓ No fixed RR values passed');
}

// Run all tests
function runAllTests() {
  try {
    testLongCalculations();
    testShortCalculations();
    testPnLAndROI();
    testNoFixedRR();
    console.log('\n🎉 All calculation tests passed!');
    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    return false;
  }
}

if (require.main === module) {
  runAllTests();
}

module.exports = {
  calculateLongRiskReward,
  calculateShortRiskReward,
  calculatePnLAndROI,
  runAllTests
};
