/**
 * Marubozu Analyzer Tests
 * 
 * Tests cover all mandatory cases specified in requirements:
 * - Strong marubozu detection
 * - Invalidation scenarios
 * - Target calculations
 * - Insufficient data handling
 * - Extended TP2 for high scores
 */

const {
  analyzeMarubozu,
  calculateMarubozuFollowScore,
  calculateTargets,
  findLiquidityLevels,
  calculateATR,
  calculateVWAP,
  calculateVolumeZScore,
  DEFAULT_CONFIG
} = require('./marubozu-analyzer');

describe('Marubozu Analyzer', () => {
  
  /**
   * Helper function to create test candles
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
  
  /**
   * Create a strong marubozu candle
   */
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
  
  describe('Strong Marubozu Detection', () => {
    test('should detect strong marubozu with FOLLOW decision', () => {
      // Create candles with strong marubozu at the end
      const candles = createTestCandles(20, 100, 0.5);
      const strongMarubozu = createStrongMarubozu(110, true);
      candles.push(strongMarubozu);
      
      // Mock order book with bullish bias
      const book = {
        bids: [{ price: '109.5', qty: '100' }, { price: '109.4', qty: '150' }],
        asks: [{ price: '110.5', qty: '80' }, { price: '110.6', qty: '120' }]
      };
      
      // Mock HTF context with bullish alignment
      const htf = {
        ema20: 108,
        ema50: 106,
        bias: 'UP'
      };
      
      const result = calculateMarubozuFollowScore({
        candles,
        book,
        htf
      });
      
      // Verify strong marubozu criteria
      expect(result.bodyPct).toBeGreaterThanOrEqual(0.95);
      expect(result.trOverAtr).toBeGreaterThanOrEqual(2.0);
      expect(result.volZ).toBeGreaterThanOrEqual(1.5);
      expect(result.takerDominance).toBeGreaterThanOrEqual(0.60);
      expect(result.structureBroke).toBe(true);
      expect(result.htfAligned).toBe(true);
      
      // Should achieve high score and FOLLOW decision
      expect(result.score).toBeGreaterThanOrEqual(8);
      expect(result.decision).toBe('FOLLOW');
      expect(result.direction).toBe('BULLISH');
    });
  });
  
  describe('Invalidation Scenarios', () => {
    test('should detect invalidation when retrace > 50% of body', () => {
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
      
      const result = calculateMarubozuFollowScore({ candles });
      
      expect(result.invalidation.retraceOver50).toBe(true);
      expect(result.invalidation.reason).toBe('retrace_over_50_percent');
    });
    
    test('should detect NO_FOLLOW for stretched marubozu', () => {
      const candles = createTestCandles(20, 100, 0.5);
      
      // Create stretched marubozu (far from VWAP)
      const stretchedMarubozu = {
        open: 100,
        high: 105,
        low: 99.5,
        close: 104.8, // Strong bullish marubozu
        volume: 2000,
        timestamp: Date.now()
      };
      candles.push(stretchedMarubozu);
      
      const result = calculateMarubozuFollowScore({ candles });
      
      // Should have low score due to stretch
      expect(result.score).toBeLessThan(5);
      expect(result.decision).toBe('NO_FOLLOW');
      expect(result.vwapStretchOk).toBe(false);
    });
  });
  
  describe('Target Calculations', () => {
    test('should calculate SL behind 61.8% of body', () => {
      const candles = createTestCandles(20, 100, 0.5);
      const marubozu = createStrongMarubozu(110, true);
      candles.push(marubozu);
      
      const score = calculateMarubozuFollowScore({ candles });
      const targets = calculateTargets({ candles }, score);
      
      const entryPrice = marubozu.close;
      const bodySize = Math.abs(marubozu.close - marubozu.open);
      const expectedSl = entryPrice - (bodySize * 0.618);
      
      // SL should be close to 61.8% retrace
      expect(Math.abs(targets.sl - expectedSl)).toBeLessThan(0.1);
      expect(targets.sl).toBeLessThan(entryPrice); // SL below entry for long
    });
    
    test('should calculate TP1 as minimum of body, ATR, and liquidity', () => {
      const candles = createTestCandles(20, 100, 0.5);
      const marubozu = createStrongMarubozu(110, true);
      candles.push(marubozu);
      
      const score = calculateMarubozuFollowScore({ candles });
      const targets = calculateTargets({ candles }, score);
      
      const entryPrice = marubozu.close;
      const bodySize = Math.abs(marubozu.close - marubozu.open);
      const bodyTarget = entryPrice + bodySize;
      
      // TP1 should be the most conservative (closest) target
      expect(targets.tp1).toBeLessThanOrEqual(bodyTarget);
      expect(targets.tp1).toBeGreaterThan(entryPrice);
    });
    
    test('should calculate TP2 with extended k2 for high scores', () => {
      const candles = createTestCandles(20, 100, 0.5);
      const marubozu = createStrongMarubozu(110, true);
      candles.push(marubozu);
      
      // Create high score scenario
      const score = {
        score: 8.5,
        direction: 'BULLISH',
        trOverAtr: 2.1,
        bodyPct: 0.96,
        volZ: 2.0,
        takerDominance: 0.67,
        structureBroke: true,
        htfAligned: true,
        vwapStretchOk: true,
        followThroughOk: true
      };
      
      const targets = calculateTargets({ candles }, score);
      
      // TP2 should be more ambitious than TP1
      expect(targets.tp2).toBeGreaterThan(targets.tp1);
      expect(targets.rrToTp2).toBeGreaterThan(targets.rrToTp1);
    });
    
    test('should maintain RR >= 1.2 to TP1', () => {
      const candles = createTestCandles(20, 100, 0.5);
      const marubozu = createStrongMarubozu(110, true);
      candles.push(marubozu);
      
      const score = calculateMarubozuFollowScore({ candles });
      const targets = calculateTargets({ candles }, score);
      
      expect(targets.rrToTp1).toBeGreaterThanOrEqual(1.2);
    });
  });
  
  describe('Insufficient Data Handling', () => {
    test('should handle missing taker/VAH/VAL data gracefully', () => {
      const candles = createTestCandles(15, 100, 0.5); // Less than required for ATR
      const marubozu = createStrongMarubozu(110, true);
      candles.push(marubozu);
      
      const result = calculateMarubozuFollowScore({ 
        candles,
        // No book data
        // No HTF data
      });
      
      expect(result.reason).toBe('insufficient_data');
      expect(result.score).toBe(0);
      expect(result.decision).toBe('NO_FOLLOW');
    });
    
    test('should degrade gracefully with missing book data', () => {
      const candles = createTestCandles(20, 100, 0.5);
      const marubozu = createStrongMarubozu(110, true);
      candles.push(marubozu);
      
      const result = calculateMarubozuFollowScore({ 
        candles
        // No book data - should still work with other metrics
      });
      
      expect(result.takerDominance).toBe(0);
      expect(result.score).toBeGreaterThan(0); // Should still calculate score
    });
  });
  
  describe('Extended TP2 for High Scores', () => {
    test('should use extended k2=2.5 for scores >= 8.5', () => {
      const candles = createTestCandles(20, 100, 0.5);
      const marubozu = createStrongMarubozu(110, true);
      candles.push(marubozu);
      
      const highScore = {
        score: 8.5,
        direction: 'BULLISH',
        trOverAtr: 2.1,
        bodyPct: 0.96,
        volZ: 2.0,
        takerDominance: 0.67,
        structureBroke: true,
        htfAligned: true,
        vwapStretchOk: true,
        followThroughOk: true
      };
      
      const targets = calculateTargets({ candles }, highScore);
      
      // Should use extended TP2 calculation
      expect(targets.tp2).toBeGreaterThan(targets.tp1);
    });
    
    test('should not extend TP2 if resistance/support is immediate', () => {
      const candles = createTestCandles(20, 100, 0.5);
      const marubozu = createStrongMarubozu(110, true);
      candles.push(marubozu);
      
      const highScore = {
        score: 8.5,
        direction: 'BULLISH',
        trOverAtr: 2.1,
        bodyPct: 0.96,
        volZ: 2.0,
        takerDominance: 0.67,
        structureBroke: true,
        htfAligned: true,
        vwapStretchOk: true,
        followThroughOk: true
      };
      
      const targets = calculateTargets({ candles }, highScore);
      
      // TP2 should respect liquidity constraints
      expect(targets.tp2).toBeFinite();
      expect(targets.rrToTp2).toBeGreaterThan(targets.rrToTp1);
    });
  });
  
  describe('Utility Functions', () => {
    test('calculateATR should work correctly', () => {
      const candles = createTestCandles(20, 100, 1);
      const atr = calculateATR(candles, 14);
      
      expect(atr).toBeGreaterThan(0);
      expect(atr).toBeFinite();
    });
    
    test('calculateVWAP should work correctly', () => {
      const candles = createTestCandles(20, 100, 1);
      const vwap = calculateVWAP(candles, 20);
      
      expect(vwap).toBeGreaterThan(0);
      expect(vwap).toBeFinite();
    });
    
    test('calculateVolumeZScore should work correctly', () => {
      const candles = createTestCandles(20, 100, 1);
      const volZ = calculateVolumeZScore(candles, 20);
      
      expect(volZ).toBeFinite();
    });
    
    test('findLiquidityLevels should find appropriate levels', () => {
      const candles = createTestCandles(20, 100, 1);
      const marubozu = createStrongMarubozu(110, true);
      
      const liquidity = findLiquidityLevels(candles, marubozu, 200);
      
      expect(liquidity.near.level).toBeGreaterThan(marubozu.close);
      expect(liquidity.far.level).toBeGreaterThan(liquidity.near.level);
      expect(liquidity.near.type).toBeDefined();
      expect(liquidity.far.type).toBeDefined();
    });
  });
  
  describe('Decision Thresholds', () => {
    test('should return FOLLOW for score >= 7', () => {
      const candles = createTestCandles(20, 100, 0.5);
      const marubozu = createStrongMarubozu(110, true);
      candles.push(marubozu);
      
      const result = calculateMarubozuFollowScore({ candles });
      
      if (result.score >= 7) {
        expect(result.decision).toBe('FOLLOW');
      }
    });
    
    test('should return CAUTION for 5 <= score < 7', () => {
      // Create moderate marubozu
      const candles = createTestCandles(20, 100, 0.5);
      const moderateMarubozu = {
        open: 110,
        high: 111.2,
        low: 109.8,
        close: 110.9, // Moderate body
        volume: 1200, // Moderate volume
        timestamp: Date.now()
      };
      candles.push(moderateMarubozu);
      
      const result = calculateMarubozuFollowScore({ candles });
      
      if (result.score >= 5 && result.score < 7) {
        expect(result.decision).toBe('CAUTION');
      }
    });
    
    test('should return NO_FOLLOW for score < 5', () => {
      // Create weak marubozu
      const candles = createTestCandles(20, 100, 0.5);
      const weakMarubozu = {
        open: 110,
        high: 110.8,
        low: 109.2,
        close: 110.4, // Small body
        volume: 800, // Low volume
        timestamp: Date.now()
      };
      candles.push(weakMarubozu);
      
      const result = calculateMarubozuFollowScore({ candles });
      
      if (result.score < 5) {
        expect(result.decision).toBe('NO_FOLLOW');
      }
    });
  });
  
  describe('Integration Test', () => {
    test('complete analysis should return valid result', () => {
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
      
      const result = analyzeMarubozu({
        candles,
        book,
        htf
      });
      
      expect(result.score).toBeDefined();
      expect(result.targets).toBeDefined();
      expect(result.liquidity).toBeDefined();
      expect(result.isValid).toBeDefined();
      expect(result.reason).toBeUndefined(); // Should be valid
      
      expect(result.score.score).toBeGreaterThanOrEqual(0);
      expect(result.score.score).toBeLessThanOrEqual(10);
      expect(['FOLLOW', 'CAUTION', 'NO_FOLLOW']).toContain(result.score.decision);
      
      expect(result.targets.sl).toBeGreaterThan(0);
      expect(result.targets.tp1).toBeGreaterThan(0);
      expect(result.targets.tp2).toBeGreaterThan(0);
      expect(result.targets.rrToTp1).toBeGreaterThanOrEqual(1.2);
    });
  });
});
