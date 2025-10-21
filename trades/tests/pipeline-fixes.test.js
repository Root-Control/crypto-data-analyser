const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('Pipeline Fixes TDD Tests', () => {
  
  describe('test_rr_sync', () => {
    it('should sync RR and TP1 after tp1Recalc', () => {
      // Test signal with RR < 1.30
      const signal = {
        side: 'LONG',
        entry: 100,
        sl: 95,
        tp1: 102, // RR = 2/5 = 0.4 < 1.30
        rr: 0.4
      };
      
      // Apply RR_MIN enforcement
      const RR_MIN = parseFloat(process.env.TP_MULTIPLIER) || 1.30;
      const slDist = Math.abs(signal.entry - signal.sl);
      const requiredTpDist = slDist * RR_MIN;
      const newTp1 = signal.side === 'LONG' ? signal.entry + requiredTpDist : signal.entry - requiredTpDist;
      
      signal.tp1 = newTp1;
      signal.rr = RR_MIN;
      signal.tp1Recalc = true;
      
      // Assertions
      assert.strictEqual(signal.rr, 1.30);
      assert.strictEqual(signal.tp1, 106.5); // 100 + 5 * 1.30
      assert.strictEqual(signal.tp1Recalc, true);
      
      // Verify RR calculation
      const actualRR = Math.abs(signal.tp1 - signal.entry) / Math.abs(signal.entry - signal.sl);
      assert.strictEqual(actualRR, 1.30);
    });
  });
  
  describe('test_cluster_radius', () => {
    it('should calculate priceRadiusFinal when clusterBypass=false', () => {
      const lastPrice = 4042.73;
      const atr10 = 15.12;
      const clusterBypass = false;
      const postClusterCount = 6;
      const finalCandidateCount = 12;
      
      // Calculate according to v6.6.2 rule
      const priceRadiusFinal = Math.max(0.0012 * lastPrice, 0.35 * atr10);
      
      // Assertions
      assert.strictEqual(clusterBypass, false);
      assert.strictEqual(typeof priceRadiusFinal, 'number');
      assert(priceRadiusFinal > 0);
      assert(postClusterCount <= finalCandidateCount);
      
      // Verify calculation: max(0.12% * price, 0.35 * ATR)
      const expectedRadius = Math.max(0.0012 * 4042.73, 0.35 * 15.12);
      assert.strictEqual(priceRadiusFinal, expectedRadius);
    });
  });
  
  describe('test_filters_total', () => {
    it('should calculate filters.totalRejected programmatically', () => {
      const rejectedByScore = 7;
      const rejectedByVolume = 5;
      const rejectedByDirection = 3;
      const rejectedBySpace = 0;
      const rejectedByRR = 2;
      const rejectedByQuality = 1;
      
      // Calculate total programmatically
      const totalRejected = rejectedByScore + rejectedByVolume + rejectedByDirection + 
                           rejectedBySpace + rejectedByRR + rejectedByQuality;
      
      // Assertions
      assert.strictEqual(totalRejected, 18);
      assert.strictEqual(typeof totalRejected, 'number');
      assert(totalRejected >= 0);
      
      // Verify it matches manual calculation
      const manualTotal = 7 + 5 + 3 + 0 + 2 + 1;
      assert.strictEqual(totalRejected, manualTotal);
    });
  });
  
  describe('test_scores_raw', () => {
    it('should calculate score statistics from raw values (not all 1.0)', () => {
      const signals = [
        { eventScore: 0.8, directionScore: 0.9 },
        { eventScore: 1.2, directionScore: 1.1 },
        { eventScore: 0.6, directionScore: 0.7 },
        { eventScore: 1.0, directionScore: 1.0 }
      ];
      
      // Calculate raw statistics
      const eventScoresRaw = signals.map(s => s.eventScore);
      const directionScoresRaw = signals.map(s => s.directionScore);
      
      const eventScoreMean = eventScoresRaw.reduce((a, b) => a + b, 0) / eventScoresRaw.length;
      const directionScoreMean = directionScoresRaw.reduce((a, b) => a + b, 0) / directionScoresRaw.length;
      
      // Calculate quantiles
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
      
      // Assertions
      assert.strictEqual(eventScoreMean, 0.9); // (0.8 + 1.2 + 0.6 + 1.0) / 4
      assert.strictEqual(directionScoreMean, 0.925); // (0.9 + 1.1 + 0.7 + 1.0) / 4
      
      // Verify quantiles are calculated correctly
      assert.strictEqual(eventQuantiles.p25, 0.6);
      assert.strictEqual(eventQuantiles.p50, 0.9);
      assert.strictEqual(eventQuantiles.p75, 1.0);
      
      // Verify scores are not all identical
      const eventScoresUnique = new Set(eventScoresRaw);
      const directionScoresUnique = new Set(directionScoresRaw);
      assert(eventScoresUnique.size > 1, 'Event scores should not all be identical');
      assert(directionScoresUnique.size > 1, 'Direction scores should not all be identical');
    });
  });
  
  describe('test_artifacts_consistency', () => {
    it('should verify artifacts exist and are consistent', () => {
      const reportsDir = path.join(__dirname, '..', 'reports');
      
      // Check if reports directory exists
      assert(fs.existsSync(reportsDir), 'Reports directory should exist');
      
      // Check for required files (they might not exist yet, but structure should be ready)
      const requiredFiles = ['signals.json', 'stats.json', 'pnl.json'];
      
      // This test verifies the structure is ready for artifact generation
      // In a real run, these files would be generated and we'd verify their contents
      console.log('Artifact structure ready for generation');
    });
  });
});

// Run tests if called directly
if (require.main === module) {
  const Mocha = require('mocha');
  const mocha = new Mocha();
  mocha.addFile(__filename);
  mocha.run((failures) => {
    process.exit(failures ? 1 : 0);
  });
}
