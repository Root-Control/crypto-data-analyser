/**
 * Descending Triangle Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { findPeaks, findValleys } = require('../utils');

function detectDescendingTriangle(candles, index, windowSize = 25) {
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

  // Check for horizontal support line (similar valley levels)
  const sortedValleys = valleys.sort((a, b) => a.price - b.price);
  const bottomValley = sortedValleys[0];
  const secondValley = sortedValleys[1];
  
  // Valleys should be within 0.5% of each other (support line)
  const valleyDifference = Math.abs(bottomValley.price - secondValley.price) / bottomValley.price;
  if (valleyDifference > 0.005) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Check for descending resistance line (lower peaks)
  const sortedPeaks = peaks.sort((a, b) => a.price - b.price);
  const firstPeak = sortedPeaks[sortedPeaks.length - 1]; // Highest
  const lastPeak = sortedPeaks[0]; // Lowest
  
  // Last peak should be lower than first peak
  if (lastPeak.price >= firstPeak.price) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate descending slope
  const peakSlope = (lastPeak.price - firstPeak.price) / (lastPeak.index - firstPeak.index);
  const maxSlope = -0.001; // Maximum negative slope
  
  if (peakSlope > maxSlope) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence
  const valleySimilarity = 1 - valleyDifference / 0.005;
  const slopeScore = Math.min(1, Math.abs(peakSlope) / 0.01);
  const confidence = (valleySimilarity + slopeScore) / 2;

  return {
    match: true,
    confidence,
    meta: {
      supportLevel: (bottomValley.price + secondValley.price) / 2,
      resistanceSlope: peakSlope,
      valleyDifference,
      valleyCount: valleys.length,
      peakCount: peaks.length
    }
  };
}

const spec = {
  name: "descending-triangle",
  type: "chart",
  minCandles: 25,
  shapeOnly: true,
  description: "Horizontal support line with descending resistance line forming a triangle. Bearish continuation pattern.",
  typicalPrediction: "bearish continuation",
  commonContext: "during a downtrend, showing increasing selling pressure"
};

module.exports = {
  detectDescendingTriangle,
  spec
};
