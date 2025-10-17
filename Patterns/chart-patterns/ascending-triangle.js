/**
 * Ascending Triangle Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { findPeaks, findValleys } = require('../utils');

function detectAscendingTriangle(candles, index, windowSize = 25) {
  if (index + windowSize >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const window = candles.slice(index, index + windowSize);

  // Find peaks and valleys
  const peaks = findPeaks(window, 3);
  const valleys = findValleys(window, 3);

  if (peaks.length < 2 || valleys.length < 2) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Check for horizontal resistance line (similar peak levels)
  const sortedPeaks = peaks.sort((a, b) => b.price - a.price);
  const topPeak = sortedPeaks[0];
  const secondPeak = sortedPeaks[1];
  
  // Peaks should be within 0.5% of each other (resistance line)
  const peakDifference = Math.abs(topPeak.price - secondPeak.price) / topPeak.price;
  if (peakDifference > 0.005) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Check for ascending support line (higher valleys)
  const sortedValleys = valleys.sort((a, b) => a.price - b.price);
  const firstValley = sortedValleys[0];
  const lastValley = sortedValleys[sortedValleys.length - 1];
  
  // Last valley should be higher than first valley
  if (lastValley.price <= firstValley.price) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate ascending slope
  const valleySlope = (lastValley.price - firstValley.price) / (lastValley.index - firstValley.index);
  const minSlope = 0.001; // Minimum positive slope
  
  if (valleySlope < minSlope) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence
  const peakSimilarity = 1 - peakDifference / 0.005;
  const slopeScore = Math.min(1, valleySlope / 0.01);
  const confidence = (peakSimilarity + slopeScore) / 2;

  return {
    match: true,
    confidence,
    meta: {
      resistanceLevel: (topPeak.price + secondPeak.price) / 2,
      supportSlope: valleySlope,
      peakDifference,
      valleyCount: valleys.length,
      peakCount: peaks.length
    }
  };
}

const spec = {
  name: "ascending-triangle",
  type: "chart",
  minCandles: 25,
  shapeOnly: true,
  description: "Línea de resistencia horizontal con línea de soporte ascendente.",
  typicalPrediction: "ruptura alcista",
  commonContext: "en tendencias alcistas, indica que los compradores están ganando fuerza"
};

module.exports = {
  detectAscendingTriangle,
  spec
};
