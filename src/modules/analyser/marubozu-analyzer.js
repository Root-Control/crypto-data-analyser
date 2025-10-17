/**
 * Marubozu Follow Score Analyzer
 * 
 * Purpose: Detect marubozu candles and compute a "Marubozu Follow Score" (0-10) 
 * with decision FOLLOW | CAUTION | NO_FOLLOW
 * 
 * Features:
 * - Quantitative marubozu detection
 * - Objective SL, TP1, TP2 calculation
 * - Liquidity level detection
 * - Invalidation system
 * - Telemetry
 */

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  atrLen: 14,
  volLookback: 20,
  percentileLookback: 200
};

/**
 * Calculate True Range for a candle
 * @param {Object} current - Current candle
 * @param {Object} previous - Previous candle
 * @returns {number} True Range value
 */
function calculateTrueRange(current, previous) {
  const highLow = current.high - current.low;
  const highClose = Math.abs(current.high - previous.close);
  const lowClose = Math.abs(current.low - previous.close);
  
  return Math.max(highLow, highClose, lowClose);
}

/**
 * Calculate Average True Range (ATR)
 * @param {Array} candles - Array of candles
 * @param {number} period - ATR period
 * @returns {number} ATR value
 */
function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  
  let totalTR = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    totalTR += calculateTrueRange(candles[i], candles[i - 1]);
  }
  
  return totalTR / period;
}

/**
 * Calculate VWAP (Volume Weighted Average Price)
 * @param {Array} candles - Array of candles
 * @param {number} lookback - Lookback period
 * @returns {number} VWAP value
 */
function calculateVWAP(candles, lookback = 20) {
  if (candles.length < lookback) return 0;
  
  let totalVolume = 0;
  let totalPriceVolume = 0;
  
  for (let i = candles.length - lookback; i < candles.length; i++) {
    const candle = candles[i];
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    totalPriceVolume += typicalPrice * candle.volume;
    totalVolume += candle.volume;
  }
  
  return totalVolume > 0 ? totalPriceVolume / totalVolume : 0;
}

/**
 * Calculate volume Z-score
 * @param {Array} candles - Array of candles
 * @param {number} lookback - Lookback period
 * @returns {number} Volume Z-score
 */
function calculateVolumeZScore(candles, lookback = 20) {
  if (candles.length < lookback) return 0;
  
  const currentVolume = candles[candles.length - 1].volume;
  const volumes = candles.slice(-lookback).map(c => c.volume);
  
  const mean = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
  const variance = volumes.reduce((sum, vol) => sum + Math.pow(vol - mean, 2), 0) / volumes.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev > 0 ? (currentVolume - mean) / stdDev : 0;
}

/**
 * Calculate taker dominance from order book
 * @param {Object} book - Order book snapshot
 * @param {Object} candle - Current candle
 * @returns {number} Taker dominance ratio (0-1)
 */
function calculateTakerDominance(book, candle) {
  if (!book || !book.bids || !book.asks || !candle.volume) return 0;
  
  // Simplified calculation - in real implementation would use taker data
  const bidVolume = book.bids.reduce((sum, level) => sum + parseFloat(level.qty), 0);
  const askVolume = book.asks.reduce((sum, level) => sum + parseFloat(level.qty), 0);
  const totalBookVolume = bidVolume + askVolume;
  
  if (totalBookVolume === 0) return 0;
  
  // Estimate taker dominance based on price action and book imbalance
  const isBullish = candle.close > candle.open;
  const bookImbalance = (bidVolume - askVolume) / totalBookVolume;
  
  // Simple heuristic: if bullish candle and positive book imbalance, assume taker buying
  return isBullish ? Math.max(0, bookImbalance + 0.3) : Math.max(0, -bookImbalance + 0.3);
}

/**
 * Detect structure break (swing high/low break)
 * @param {Array} candles - Array of candles
 * @param {Object} currentCandle - Current marubozu candle
 * @returns {boolean} Whether structure was broken
 */
function detectStructureBreak(candles, currentCandle) {
  if (candles.length < 20) return false;
  
  const isBullish = currentCandle.close > currentCandle.open;
  const lookback = Math.min(20, candles.length - 1);
  
  // Find recent swing high/low
  let recentSwing = isBullish ? 0 : Infinity;
  
  for (let i = candles.length - lookback; i < candles.length - 1; i++) {
    if (isBullish) {
      recentSwing = Math.max(recentSwing, candles[i].high);
    } else {
      recentSwing = Math.min(recentSwing, candles[i].low);
    }
  }
  
  // Check if current candle broke the structure
  if (isBullish) {
    return currentCandle.close > recentSwing;
  } else {
    return currentCandle.close < recentSwing;
  }
}

/**
 * Check HTF alignment
 * @param {Object} htf - Higher timeframe context
 * @param {Object} candle - Current candle
 * @returns {boolean} Whether HTF is aligned
 */
function checkHTFAlignment(htf, candle) {
  if (!htf) return false;
  
  const isBullish = candle.close > candle.open;
  
  if (htf.bias) {
    return (isBullish && htf.bias === 'UP') || (!isBullish && htf.bias === 'DOWN');
  }
  
  if (htf.ema20 && htf.ema50) {
    return (isBullish && candle.close > htf.ema20 && htf.ema20 > htf.ema50) ||
           (!isBullish && candle.close < htf.ema20 && htf.ema20 < htf.ema50);
  }
  
  return false;
}

/**
 * Check VWAP stretch
 * @param {Object} candle - Current candle
 * @param {number} vwap - VWAP value
 * @param {number} atr - ATR value
 * @returns {boolean} Whether VWAP stretch is acceptable
 */
function checkVWAPStretch(candle, vwap, atr) {
  if (atr === 0) return true;
  
  const stretch = Math.abs(candle.close - vwap) / atr;
  return stretch <= 1.5;
}

/**
 * Check follow-through criteria
 * @param {Array} candles - Array of candles
 * @param {Object} marubozuCandle - The marubozu candle
 * @returns {boolean} Whether follow-through is good
 */
function checkFollowThrough(candles, marubozuCandle) {
  if (candles.length < 2) return false;
  
  const nextCandle = candles[candles.length - 1];
  const isBullish = marubozuCandle.close > marubozuCandle.open;
  const bodySize = Math.abs(marubozuCandle.close - marubozuCandle.open);
  
  // Check retrace (should be <= 38.2% of body)
  let maxRetrace = 0;
  if (isBullish) {
    maxRetrace = Math.max(0, marubozuCandle.close - nextCandle.low);
  } else {
    maxRetrace = Math.max(0, nextCandle.high - marubozuCandle.close);
  }
  
  const retracePercent = maxRetrace / bodySize;
  
  // Check for HH/LL
  let makesNewExtreme = false;
  if (candles.length >= 3) {
    const prevCandle = candles[candles.length - 3];
    if (isBullish) {
      makesNewExtreme = nextCandle.high > prevCandle.high;
    } else {
      makesNewExtreme = nextCandle.low < prevCandle.low;
    }
  }
  
  return retracePercent <= 0.382 && makesNewExtreme;
}

/**
 * Calculate Marubozu Follow Score
 * @param {Object} input - Analysis input
 * @returns {Object} Follow score result
 */
function calculateMarubozuFollowScore(input) {
  const { candles, book, htf, config = {} } = input;
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  if (candles.length < cfg.atrLen + 1) {
    return {
      direction: 'NEUTRAL',
      bodyPct: 0,
      trOverAtr: 0,
      volZ: 0,
      takerDominance: 0,
      structureBroke: false,
      htfAligned: false,
      vwapStretchOk: false,
      followThroughOk: false,
      score: 0,
      decision: 'NO_FOLLOW',
      invalidation: {
        retraceOver50: false,
        backInsideRange: false,
        reason: 'insufficient_data'
      }
    };
  }
  
  const currentCandle = candles[candles.length - 1];
  const isBullish = currentCandle.close > currentCandle.open;
  
  // Calculate metrics
  const bodySize = Math.abs(currentCandle.close - currentCandle.open);
  const totalRange = currentCandle.high - currentCandle.low;
  const bodyPct = totalRange > 0 ? bodySize / totalRange : 0;
  
  const atr = calculateATR(candles, cfg.atrLen);
  const tr = calculateTrueRange(currentCandle, candles[candles.length - 2]);
  const trOverAtr = atr > 0 ? tr / atr : 0;
  
  const volZ = calculateVolumeZScore(candles, cfg.volLookback);
  const takerDominance = calculateTakerDominance(book, currentCandle);
  const structureBroke = detectStructureBreak(candles, currentCandle);
  const htfAligned = checkHTFAlignment(htf, currentCandle);
  
  const vwap = calculateVWAP(candles, cfg.volLookback);
  const vwapStretchOk = checkVWAPStretch(currentCandle, vwap, atr);
  const followThroughOk = checkFollowThrough(candles, currentCandle);
  
  // Calculate score (0-10)
  let score = 0;
  
  // Body percentage (0-2 points)
  if (bodyPct >= 0.95) score += 2;
  else if (bodyPct >= 0.90) score += 1;
  
  // TR/ATR ratio (0-2 points)
  if (trOverAtr >= 2.0) score += 2;
  else if (trOverAtr >= 1.5) score += 1;
  
  // Volume Z-score (0-1 points)
  if (volZ >= 1.5) score += 1;
  
  // Taker dominance (0-1 points)
  if (takerDominance >= 0.60) {
    const isTakerAligned = (isBullish && takerDominance > 0.5) || (!isBullish && takerDominance < 0.5);
    if (isTakerAligned) score += 1;
  }
  
  // Structure break (0-2 points)
  if (structureBroke) score += 2;
  
  // HTF alignment (0-1 points)
  if (htfAligned) score += 1;
  
  // VWAP stretch (0-0.5 points)
  if (vwapStretchOk) score += 0.5;
  
  // Follow-through (0-0.5 points)
  if (followThroughOk) score += 0.5;
  
  // Determine decision
  let decision;
  if (score >= 7) decision = 'FOLLOW';
  else if (score >= 5) decision = 'CAUTION';
  else decision = 'NO_FOLLOW';
  
  // Check for invalidation
  let retraceOver50 = false;
  let backInsideRange = false;
  let invalidationReason = '';
  
  if (candles.length >= 2) {
    const nextCandle = candles[candles.length - 1];
    const retrace = isBullish ? 
      Math.max(0, currentCandle.close - nextCandle.low) :
      Math.max(0, nextCandle.high - currentCandle.close);
    
    retraceOver50 = retrace > (bodySize * 0.5);
    
    if (retraceOver50) {
      invalidationReason = 'retrace_over_50_percent';
    }
  }
  
  return {
    direction: isBullish ? 'BULLISH' : 'BEARISH',
    bodyPct,
    trOverAtr,
    volZ,
    takerDominance,
    structureBroke,
    htfAligned,
    vwapStretchOk,
    followThroughOk,
    score,
    decision,
    invalidation: {
      retraceOver50,
      backInsideRange,
      reason: invalidationReason
    }
  };
}

/**
 * Find liquidity levels
 * @param {Array} candles - Array of candles
 * @param {Object} marubozuCandle - Marubozu candle
 * @param {number} lookback - Lookback period
 * @returns {Object} Liquidity levels
 */
function findLiquidityLevels(candles, marubozuCandle, lookback = 200) {
  const isBullish = marubozuCandle.close > marubozuCandle.open;
  const entryPrice = marubozuCandle.close;
  
  // Find swing levels
  const recentCandles = candles.slice(-Math.min(lookback, candles.length));
  let swingHigh = 0;
  let swingLow = Infinity;
  
  for (const candle of recentCandles) {
    swingHigh = Math.max(swingHigh, candle.high);
    swingLow = Math.min(swingLow, candle.low);
  }
  
  // Find round figures
  const roundFigures = [];
  const price = entryPrice;
  const magnitude = Math.pow(10, Math.floor(Math.log10(price)));
  
  for (let i = 1; i <= 5; i++) {
    roundFigures.push(i * magnitude);
    roundFigures.push(i * magnitude * 10);
  }
  
  // Select appropriate levels
  let nearLevel, farLevel;
  
  if (isBullish) {
    // For bullish trades, look for resistance levels above
    const aboveLevels = roundFigures.filter(level => level > entryPrice).sort((a, b) => a - b);
    nearLevel = aboveLevels[0] || swingHigh;
    farLevel = aboveLevels[1] || (swingHigh * 1.1);
  } else {
    // For bearish trades, look for support levels below
    const belowLevels = roundFigures.filter(level => level < entryPrice).sort((a, b) => b - a);
    nearLevel = belowLevels[0] || swingLow;
    farLevel = belowLevels[1] || (swingLow * 0.9);
  }
  
  return {
    near: {
      level: nearLevel,
      type: roundFigures.includes(nearLevel) ? 'ROUND_FIGURE' : 'SWING',
      distance: Math.abs(nearLevel - entryPrice) / entryPrice
    },
    far: {
      level: farLevel,
      type: roundFigures.includes(farLevel) ? 'ROUND_FIGURE' : 'SWING',
      distance: Math.abs(farLevel - entryPrice) / entryPrice
    }
  };
}

/**
 * Calculate targets (SL, TP1, TP2)
 * @param {Object} input - Analysis input
 * @param {Object} score - Follow score result
 * @returns {Object} Targets
 */
function calculateTargets(input, score) {
  const { candles, config = {} } = input;
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  const marubozuCandle = candles[candles.length - 1];
  const isBullish = marubozuCandle.close > marubozuCandle.open;
  const entryPrice = marubozuCandle.close;
  const bodySize = Math.abs(marubozuCandle.close - marubozuCandle.open);
  
  const atr = calculateATR(candles, cfg.atrLen);
  const liquidity = findLiquidityLevels(candles, marubozuCandle, cfg.percentileLookback);
  
  // Calculate Stop Loss (conservative: 61.8% of body, safe: beyond opposite extreme)
  let sl;
  if (isBullish) {
    const conservativeSl = entryPrice - (bodySize * 0.618);
    const safeSl = marubozuCandle.low * 0.999; // Slightly below the low
    sl = Math.max(conservativeSl, safeSl);
  } else {
    const conservativeSl = entryPrice + (bodySize * 0.618);
    const safeSl = marubozuCandle.high * 1.001; // Slightly above the high
    sl = Math.min(conservativeSl, safeSl);
  }
  
  // Calculate TP1 (closest among: body target, ATR target, near liquidity)
  const tr = calculateTrueRange(marubozuCandle, candles[candles.length - 2]);
  const trOverAtr = atr > 0 ? tr / atr : 0;
  const k1 = trOverAtr >= 2.0 ? 1.0 : 1.25; // Lower k1 if high expansion
  const bodyTarget = isBullish ? entryPrice + bodySize : entryPrice - bodySize;
  const atrTarget = isBullish ? entryPrice + (k1 * atr) : entryPrice - (k1 * atr);
  const liquidityTarget = liquidity.near.level;
  
  let tp1;
  if (isBullish) {
    tp1 = Math.min(bodyTarget, atrTarget, liquidityTarget);
  } else {
    tp1 = Math.max(bodyTarget, atrTarget, liquidityTarget);
  }
  
  // Calculate TP2 (extended projection)
  let k2 = 2.0;
  if (score.score >= 8.5) {
    k2 = 2.5; // Allow extension for high scores
  }
  
  const atrTarget2 = isBullish ? entryPrice + (k2 * atr) : entryPrice - (k2 * atr);
  const farLiquidityTarget = liquidity.far.level;
  
  let tp2;
  if (isBullish) {
    tp2 = Math.min(atrTarget2, farLiquidityTarget);
  } else {
    tp2 = Math.max(atrTarget2, farLiquidityTarget);
  }
  
  // Calculate Risk/Reward ratios
  const risk = Math.abs(entryPrice - sl);
  const reward1 = Math.abs(tp1 - entryPrice);
  const reward2 = Math.abs(tp2 - entryPrice);
  
  const rrToTp1 = risk > 0 ? reward1 / risk : 0;
  const rrToTp2 = risk > 0 ? reward2 / risk : 0;
  
  // Determine trailing type
  const trailingType = score.score >= 7 ? 'HL2' : 'ATR';
  const atrMult = trailingType === 'ATR' ? 1.2 : undefined;
  
  return {
    sl,
    tp1,
    tp2,
    trailing: {
      type: trailingType,
      atrMult
    },
    rrToTp1,
    rrToTp2
  };
}

/**
 * Main analysis function
 * @param {Object} input - Analysis input
 * @returns {Object} Complete analysis result
 */
function analyzeMarubozu(input) {
  const score = calculateMarubozuFollowScore(input);
  const targets = calculateTargets(input, score);
  const liquidity = findLiquidityLevels(input.candles, input.candles[input.candles.length - 1]);
  
  // Validate minimum RR
  const isValid = targets.rrToTp1 >= 1.2;
  const reason = isValid ? undefined : 'RR_to_TP1_below_1.2';
  
  return {
    score,
    targets,
    liquidity,
    isValid,
    reason
  };
}

// Export functions
module.exports = {
  analyzeMarubozu,
  calculateMarubozuFollowScore,
  calculateTargets,
  findLiquidityLevels,
  calculateATR,
  calculateVWAP,
  calculateVolumeZScore,
  DEFAULT_CONFIG
};
