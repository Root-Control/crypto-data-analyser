/**
 * Double Top Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { findPeaks, calculatePriceTolerance } = require('../utils');

function detectDoubleTop(candles, index, windowSize = 30) {
  if (index + windowSize >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const window = candles.slice(index, index + windowSize);
  
  // Find peaks in the window
  const peaks = findPeaks(window, 3);
  
  if (peaks.length < 2) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Get the two highest peaks
  const sortedPeaks = peaks.sort((a, b) => b.price - a.price);
  const peak1 = sortedPeaks[0];
  const peak2 = sortedPeaks[1];
  
  // Check if peaks are similar in price (within 1% tolerance)
  const priceSimilarity = calculatePriceTolerance(peak1.price, peak2.price, 0.01);
  
  if (!priceSimilarity) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Check if there's a valley between the peaks
  const valleyIndex = Math.min(peak1.index, peak2.index) + 1;
  const valleyEndIndex = Math.max(peak1.index, peak2.index) - 1;
  
  if (valleyIndex >= valleyEndIndex) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  let valleyLow = window[valleyIndex].low;
  for (let i = valleyIndex; i <= valleyEndIndex; i++) {
    valleyLow = Math.min(valleyLow, window[i].low);
  }
  
  // Valley should be at least 2% below the peaks
  const valleyDepth = (peak1.price - valleyLow) / peak1.price;
  
  if (valleyDepth < 0.02) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Calculate confidence based on pattern quality
  const priceMatch = 1 - Math.abs(peak1.price - peak2.price) / ((peak1.price + peak2.price) / 2);
  const depthScore = Math.min(1, valleyDepth / 0.05); // Normalize to 5% depth
  const confidence = (priceMatch + depthScore) / 2;
  
  return {
    match: true,
    confidence,
    meta: {
      peak1Price: peak1.price,
      peak2Price: peak2.price,
      valleyLow,
      valleyDepth,
      priceDifference: Math.abs(peak1.price - peak2.price),
      priceSimilarity: priceMatch
    }
  };
}

const spec = {
  name: "double-top",
  type: "chart",
  minCandles: 30,
  shapeOnly: true,
  description: "Two peaks at approximately the same price level with a trough between them. Bearish reversal pattern.",
  typicalPrediction: "bearish reversal",
  commonContext: "after an uptrend, when price fails to break above resistance twice"
};

module.exports = {
  detectDoubleTop,
  spec
};
