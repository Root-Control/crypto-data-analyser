/**
 * Pattern Detection Utilities
 * Helper functions for candle analysis and pattern detection
 */

/**
 * Candle Body and Wick Calculations
 */

function calculateBodySize(candle) {
  return Math.abs(candle.close - candle.open);
}

function calculateBodyRatio(candle) {
  const bodySize = calculateBodySize(candle);
  const totalRange = candle.high - candle.low;
  return totalRange > 0 ? bodySize / totalRange : 0;
}

function calculateUpperWick(candle) {
  return candle.high - Math.max(candle.open, candle.close);
}

function calculateLowerWick(candle) {
  return Math.min(candle.open, candle.close) - candle.low;
}

function calculateTotalRange(candle) {
  return candle.high - candle.low;
}

function calculateUpperWickRatio(candle) {
  const upperWick = calculateUpperWick(candle);
  const totalRange = calculateTotalRange(candle);
  return totalRange > 0 ? upperWick / totalRange : 0;
}

function calculateLowerWickRatio(candle) {
  const lowerWick = calculateLowerWick(candle);
  const totalRange = calculateTotalRange(candle);
  return totalRange > 0 ? lowerWick / totalRange : 0;
}

/**
 * Candle Direction Markers
 */

function isBullish(candle) {
  return candle.close > candle.open;
}

function isBearish(candle) {
  return candle.close < candle.open;
}

function isDoji(candle, tolerance = 0.05) {
  const bodyRatio = calculateBodyRatio(candle);
  return bodyRatio <= tolerance;
}

function isLongCandle(candle, threshold = 0.7) {
  const bodyRatio = calculateBodyRatio(candle);
  return bodyRatio >= threshold;
}

function isShortCandle(candle, threshold = 0.3) {
  const bodyRatio = calculateBodyRatio(candle);
  return bodyRatio <= threshold;
}

/**
 * Peak and Valley Detection for Chart Patterns
 */

function findPeaks(candles, windowSize = 5) {
  const peaks = [];
  for (let i = windowSize; i < candles.length - windowSize; i++) {
    let isPeak = true;
    for (let j = i - windowSize; j <= i + windowSize; j++) {
      if (j !== i && candles[j].high >= candles[i].high) {
        isPeak = false;
        break;
      }
    }
    if (isPeak) {
      peaks.push({ index: i, price: candles[i].high });
    }
  }
  return peaks;
}

function findValleys(candles, windowSize = 5) {
  const valleys = [];
  for (let i = windowSize; i < candles.length - windowSize; i++) {
    let isValley = true;
    for (let j = i - windowSize; j <= i + windowSize; j++) {
      if (j !== i && candles[j].low <= candles[i].low) {
        isValley = false;
        break;
      }
    }
    if (isValley) {
      valleys.push({ index: i, price: candles[i].low });
    }
  }
  return valleys;
}

function calculatePeakValleySimilarity(peak1, peak2, tolerance = 0.003) {
  const diff = Math.abs(peak1.price - peak2.price);
  const avgPrice = (peak1.price + peak2.price) / 2;
  const percentageDiff = diff / avgPrice;
  return percentageDiff <= tolerance;
}

/**
 * Tolerance and Similarity Calculations
 */

function calculatePriceTolerance(price1, price2, percentage) {
  const diff = Math.abs(price1 - price2);
  const avgPrice = (price1 + price2) / 2;
  const percentageDiff = diff / avgPrice;
  return percentageDiff <= percentage;
}

function isWithinTolerance(value, target, tolerance) {
  const diff = Math.abs(value - target);
  const percentageDiff = diff / target;
  return percentageDiff <= tolerance;
}

/**
 * Pattern Matching Utilities
 */

function calculatePatternConfidence(matches, totalChecks) {
  return totalChecks > 0 ? matches / totalChecks : 0;
}

function isEngulfing(candle1, candle2) {
  const body1 = calculateBodySize(candle1);
  const body2 = calculateBodySize(candle2);
  
  if (body2 <= body1) return false;
  
  if (isBullish(candle2) && isBearish(candle1)) {
    return candle2.open <= candle1.close && candle2.close >= candle1.open;
  } else if (isBearish(candle2) && isBullish(candle1)) {
    return candle2.open >= candle1.close && candle2.close <= candle1.open;
  }
  
  return false;
}

function isHarami(candle1, candle2) {
  const body1 = calculateBodySize(candle1);
  const body2 = calculateBodySize(candle2);
  
  if (body2 >= body1) return false;
  
  if (isBullish(candle1) && isBearish(candle2)) {
    return candle2.open >= candle1.open && candle2.close <= candle1.close;
  } else if (isBearish(candle1) && isBullish(candle2)) {
    return candle2.open <= candle1.open && candle2.close >= candle1.close;
  }
  
  return false;
}

function isTweezers(candle1, candle2, tolerance = 0.002) {
  // Tweezers top (similar highs)
  const highDiff = Math.abs(candle1.high - candle2.high);
  const avgHigh = (candle1.high + candle2.high) / 2;
  const highSimilar = (highDiff / avgHigh) <= tolerance;
  
  // Tweezers bottom (similar lows)
  const lowDiff = Math.abs(candle1.low - candle2.low);
  const avgLow = (candle1.low + candle2.low) / 2;
  const lowSimilar = (lowDiff / avgLow) <= tolerance;
  
  return highSimilar || lowSimilar;
}

/**
 * ATR (Average True Range) Calculation
 */
function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  
  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    
    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);
    
    const trueRange = Math.max(tr1, tr2, tr3);
    trueRanges.push(trueRange);
  }
  
  // Calculate ATR as simple moving average of true ranges
  const atrValues = trueRanges.slice(-period);
  return atrValues.reduce((sum, tr) => sum + tr, 0) / atrValues.length;
}

/**
 * Calculate median body size from last N candles
 */
function calculateMedianBody(candles, period = 20) {
  if (candles.length < period) return 0;
  
  const recentCandles = candles.slice(-period);
  const bodySizes = recentCandles.map(candle => calculateBodySize(candle));
  bodySizes.sort((a, b) => a - b);
  
  const mid = Math.floor(bodySizes.length / 2);
  return bodySizes.length % 2 === 0 
    ? (bodySizes[mid - 1] + bodySizes[mid]) / 2 
    : bodySizes[mid];
}

module.exports = {
  // Candle calculations
  calculateBodySize,
  calculateBodyRatio,
  calculateUpperWick,
  calculateLowerWick,
  calculateTotalRange,
  calculateUpperWickRatio,
  calculateLowerWickRatio,
  
  // Direction markers
  isBullish,
  isBearish,
  isDoji,
  isLongCandle,
  isShortCandle,
  
  // Peak/valley detection
  findPeaks,
  findValleys,
  calculatePeakValleySimilarity,
  
  // Pattern matching
  calculatePatternConfidence,
  isEngulfing,
  isHarami,
  isTweezers,
  
  // Tolerance calculations
  calculatePriceTolerance,
  isWithinTolerance,
  
  // Advanced calculations
  calculateATR,
  calculateMedianBody
};
