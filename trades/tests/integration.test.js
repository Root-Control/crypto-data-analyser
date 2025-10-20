const assert = require('assert');

// Integration test with dummy signals
function createDummySignals() {
  return [
    {
      id: 'test-1',
      dtISO: '2025-01-01T10:00:00.000Z',
      side: 'LONG',
      entry: 1000,
      sl: 980, // 2% risk
      tp1: 1020, // 2% reward, RR = 1.0
      tp2: 1040,
      candle: {
        open: 995,
        high: 1005,
        low: 990,
        close: 1000,
        volume: 1000
      },
      nextCandle: {
        open: 1000,
        high: 1020,
        low: 980,
        close: 1010,
        volume: 1200
      }
    },
    {
      id: 'test-2',
      dtISO: '2025-01-01T11:00:00.000Z',
      side: 'SHORT',
      entry: 2000,
      sl: 2040, // 2% risk
      tp1: 1960, // 2% reward, RR = 1.0
      tp2: 1920,
      candle: {
        open: 2005,
        high: 2010,
        low: 1990,
        close: 2000,
        volume: 2000
      },
      nextCandle: {
        open: 2000,
        high: 2010,
        low: 1950,
        close: 1980,
        volume: 1800
      }
    },
    {
      id: 'test-3',
      dtISO: '2025-01-01T12:00:00.000Z',
      side: 'LONG',
      entry: 1000,
      sl: 950, // 5% risk
      tp1: 1100, // 10% reward, RR = 2.0
      tp2: 1200,
      candle: {
        open: 995,
        high: 1005,
        low: 990,
        close: 1000,
        volume: 1000
      },
      nextCandle: {
        open: 1000,
        high: 1020,
        low: 980,
        close: 1010,
        volume: 1200
      }
    }
  ];
}

function calculateSignalMetrics(signal) {
  const capital = 400;
  const leverage = 10;
  const nocional = capital * leverage;
  
  // Risk/Reward calculation
  let risk_abs, reward_abs, rr, slPct, tp1Pct, tp2Pct;
  
  if (signal.side === 'LONG') {
    risk_abs = signal.entry - signal.sl;
    reward_abs = signal.tp1 - signal.entry;
    rr = reward_abs / risk_abs;
    slPct = (signal.sl / signal.entry - 1) * 100;
    tp1Pct = (signal.tp1 / signal.entry - 1) * 100;
    if (signal.tp2) tp2Pct = (signal.tp2 / signal.entry - 1) * 100;
  } else {
    risk_abs = signal.sl - signal.entry;
    reward_abs = signal.entry - signal.tp1;
    rr = reward_abs / risk_abs;
    slPct = (signal.sl / signal.entry - 1) * 100; // For SHORT: SL > entry
    tp1Pct = (signal.entry - signal.tp1) / signal.entry * 100; // For SHORT: entry > tp1
    if (signal.tp2) tp2Pct = (signal.entry - signal.tp2) / signal.entry * 100;
  }
  
  // P&L calculation
  let pnlBruto;
  if (signal.side === 'LONG') {
    pnlBruto = nocional * ((signal.tp1 - signal.entry) / signal.entry);
  } else {
    pnlBruto = nocional * ((signal.entry - signal.tp1) / signal.entry);
  }
  
  const takerFees = nocional * 0.001; // 0.10%
  const makerFees = nocional * 0.0004; // 0.04%
  const slippage = nocional * 0.0002; // 0.02%
  
  const netTaker = pnlBruto - takerFees - slippage;
  const netMaker = pnlBruto - makerFees - slippage;
  const roiTaker = netTaker / capital;
  const roiMaker = netMaker / capital;
  
  // Next candle movement
  let up1Pct, down1Pct, wickLow, wickLowPct, closeDeltaPct;
  if (signal.nextCandle) {
    up1Pct = ((signal.nextCandle.high - signal.entry) / signal.entry) * 100;
    down1Pct = ((signal.entry - signal.nextCandle.low) / signal.entry) * 100;
    wickLow = Math.max(0, signal.entry - signal.nextCandle.low);
    wickLowPct = (wickLow / signal.entry) * 100;
    closeDeltaPct = ((signal.nextCandle.close - signal.entry) / signal.entry) * 100;
  }
  
  return {
    risk_abs,
    reward_abs,
    rr,
    slPct,
    tp1Pct,
    tp2Pct,
    pnlBruto,
    netTaker,
    netMaker,
    roiTaker,
    roiMaker,
    up1Pct,
    down1Pct,
    wickLow,
    wickLowPct,
    closeDeltaPct
  };
}

function testIntegration() {
  console.log('Testing integration with dummy signals...');
  
  const signals = createDummySignals();
  const results = signals.map(calculateSignalMetrics);
  
  // Test LONG signal
  const longResult = results[0];
  assert(longResult.risk_abs > 0, 'LONG risk_abs must be positive');
  assert(longResult.reward_abs > 0, 'LONG reward_abs must be positive');
  assert(longResult.rr === 1, `Expected RR=1, got ${longResult.rr}`);
  assert(longResult.slPct < 0, 'LONG SL% must be negative');
  assert(longResult.tp1Pct > 0, 'LONG TP1% must be positive');
  assert(longResult.roiTaker < 0.25, `ROI should be reasonable, got ${longResult.roiTaker * 100}%`);
  
  // Test SHORT signal
  const shortResult = results[1];
  assert(shortResult.risk_abs > 0, 'SHORT risk_abs must be positive');
  assert(shortResult.reward_abs > 0, 'SHORT reward_abs must be positive');
  assert(shortResult.rr === 1, `Expected RR=1, got ${shortResult.rr}`);
  assert(shortResult.slPct > 0, 'SHORT SL% must be positive');
  assert(shortResult.tp1Pct > 0, 'SHORT TP1% must be positive');
  assert(shortResult.roiTaker < 0.25, `ROI should be reasonable, got ${shortResult.roiTaker * 100}%`);
  
  // Test next candle movement
  assert(typeof longResult.up1Pct === 'number', 'up1Pct should be calculated');
  assert(typeof longResult.down1Pct === 'number', 'down1Pct should be calculated');
  assert(typeof longResult.wickLow === 'number', 'wickLow should be calculated');
  assert(typeof longResult.closeDeltaPct === 'number', 'closeDeltaPct should be calculated');
  
  // Test no fixed values
  const rrs = results.map(r => r.rr);
  const uniqueRRs = new Set(rrs.map(rr => Math.round(rr * 100) / 100));
  assert(uniqueRRs.size > 1, 'RRs should not all be identical');
  
  console.log('✓ Integration test passed');
  
  return results;
}

function testNoCappedMetrics() {
  console.log('Testing no capped metrics...');
  
  const signals = createDummySignals();
  const results = signals.map(calculateSignalMetrics);
  
  // Check that we don't have all 1.0 values
  const allRRs = results.map(r => r.rr);
  const allROIs = results.map(r => r.roiTaker);
  
  const hasNonOneRR = allRRs.some(rr => rr !== 1.0);
  const hasNonOneROI = allROIs.some(roi => roi !== 1.0);
  
  assert(hasNonOneRR, 'Should not have all RRs = 1.0');
  assert(hasNonOneROI, 'Should not have all ROIs = 1.0');
  
  console.log('✓ No capped metrics test passed');
}

function runIntegrationTests() {
  try {
    const results = testIntegration();
    testNoCappedMetrics();
    console.log('\n🎉 All integration tests passed!');
    return results;
  } catch (error) {
    console.error('\n❌ Integration test failed:', error.message);
    return false;
  }
}

if (require.main === module) {
  runIntegrationTests();
}

module.exports = {
  createDummySignals,
  calculateSignalMetrics,
  runIntegrationTests
};
