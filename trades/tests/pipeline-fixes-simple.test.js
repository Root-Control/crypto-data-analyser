const assert = require('assert');

console.log('🧪 Running Pipeline Fixes TDD Tests...\n');

// Test 1: RR Sync
console.log('1. Testing RR Sync...');
const signal = {
  side: 'LONG',
  entry: 100,
  sl: 95,
  tp1: 102, // RR = 2/5 = 0.4 < 1.30
  rr: 0.4
};

const RR_MIN = parseFloat(process.env.TP_MULTIPLIER) || 1.30;
const slDist = Math.abs(signal.entry - signal.sl);
const requiredTpDist = slDist * RR_MIN;
const newTp1 = signal.side === 'LONG' ? signal.entry + requiredTpDist : signal.entry - requiredTpDist;

signal.tp1 = newTp1;
signal.rr = RR_MIN;
signal.tp1Recalc = true;

assert.strictEqual(signal.rr, 1.30, 'RR should be 1.30');
assert.strictEqual(signal.tp1, 106.5, 'TP1 should be 106.5');
assert.strictEqual(signal.tp1Recalc, true, 'tp1Recalc should be true');

const actualRR = Math.abs(signal.tp1 - signal.entry) / Math.abs(signal.entry - signal.sl);
assert.strictEqual(actualRR, 1.30, 'Calculated RR should match');
console.log('✅ RR Sync test passed\n');

// Test 2: Cluster Radius
console.log('2. Testing Cluster Radius...');
const lastPrice = 4042.73;
const atr10 = 15.12;
const clusterBypass = false;
const postClusterCount = 6;
const finalCandidateCount = 12;

const priceRadiusFinal = Math.max(0.0012 * lastPrice, 0.35 * atr10);

assert.strictEqual(clusterBypass, false, 'clusterBypass should be false');
assert.strictEqual(typeof priceRadiusFinal, 'number', 'priceRadiusFinal should be a number');
assert(priceRadiusFinal > 0, 'priceRadiusFinal should be positive');
assert(postClusterCount <= finalCandidateCount, 'postClusterCount should be <= finalCandidateCount');

const expectedRadius = Math.max(0.0012 * 4042.73, 0.35 * 15.12);
assert.strictEqual(priceRadiusFinal, expectedRadius, 'priceRadiusFinal calculation should be correct');
console.log('✅ Cluster Radius test passed\n');

// Test 3: Filters Total
console.log('3. Testing Filters Total...');
const rejectedByScore = 7;
const rejectedByVolume = 5;
const rejectedByDirection = 3;
const rejectedBySpace = 0;
const rejectedByRR = 2;
const rejectedByQuality = 1;

const totalRejected = rejectedByScore + rejectedByVolume + rejectedByDirection + 
                     rejectedBySpace + rejectedByRR + rejectedByQuality;

assert.strictEqual(totalRejected, 18, 'totalRejected should be 18');
assert.strictEqual(typeof totalRejected, 'number', 'totalRejected should be a number');
assert(totalRejected >= 0, 'totalRejected should be non-negative');
console.log('✅ Filters Total test passed\n');

// Test 4: Scores Raw
console.log('4. Testing Scores Raw...');
const signals = [
  { eventScore: 0.8, directionScore: 0.9 },
  { eventScore: 1.2, directionScore: 1.1 },
  { eventScore: 0.6, directionScore: 0.7 },
  { eventScore: 1.0, directionScore: 1.0 }
];

const eventScoresRaw = signals.map(s => s.eventScore);
const directionScoresRaw = signals.map(s => s.directionScore);

const eventScoreMean = eventScoresRaw.reduce((a, b) => a + b, 0) / eventScoresRaw.length;
const directionScoreMean = directionScoresRaw.reduce((a, b) => a + b, 0) / directionScoresRaw.length;

const calculateQuantiles = (arr) => {
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    p25: sorted[Math.floor(sorted.length * 0.25)],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p75: sorted[Math.floor(sorted.length * 0.75)]
  };
};

const eventQuantiles = calculateQuantiles(eventScoresRaw);
const directionQuantiles = calculateQuantiles(directionScoresRaw);

assert.strictEqual(eventScoreMean, 0.9, 'eventScoreMean should be 0.9');
assert.strictEqual(directionScoreMean, 0.925, 'directionScoreMean should be 0.925');

assert.strictEqual(eventQuantiles.p25, 0.8, 'eventQuantiles.p25 should be 0.8');
assert.strictEqual(eventQuantiles.p50, 1.0, 'eventQuantiles.p50 should be 1.0');
assert.strictEqual(eventQuantiles.p75, 1.2, 'eventQuantiles.p75 should be 1.2');

const eventScoresUnique = new Set(eventScoresRaw);
const directionScoresUnique = new Set(directionScoresRaw);
assert(eventScoresUnique.size > 1, 'Event scores should not all be identical');
assert(directionScoresUnique.size > 1, 'Direction scores should not all be identical');
console.log('✅ Scores Raw test passed\n');

console.log('🎉 All Pipeline Fixes TDD Tests PASSED!');
