/**
 * Symmetrical Triangle Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { findPeaks, findValleys } = require('../utils');

function detectSymmetricalTriangle(candles, index, windowSize = 25) {
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

  // Sort peaks by price (highest first) and valleys (lowest first)
  const sortedPeaks = peaks.sort((a, b) => b.price - a.price);
  const sortedValleys = valleys.sort((a, b) => a.price - b.price);

  // Check for converging trend lines
  // Resistance line: peaks should be descending
  const firstPeak = sortedPeaks[sortedPeaks.length - 1]; // Highest
  const lastPeak = sortedPeaks[0]; // Lowest
  
  if (lastPeak.price >= firstPeak.price) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Support line: valleys should be ascending
  const firstValley = sortedValleys[0]; // Lowest
  const lastValley = sortedValleys[sortedValleys.length - 1]; // Highest
  
  if (lastValley.price <= firstValley.price) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate slopes
  const resistanceSlope = (lastPeak.price - firstPeak.price) / (lastPeak.index - firstPeak.index);
  const supportSlope = (lastValley.price - firstValley.price) / (lastValley.index - firstValley.index);
  
  // Slopes should be opposite and similar in magnitude
  const slopeSimilarity = Math.abs(Math.abs(resistanceSlope) - Math.abs(supportSlope)) / Math.max(Math.abs(resistanceSlope), Math.abs(supportSlope));
  
  if (slopeSimilarity > 0.5) { // Allow 50% difference in slopes
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence
  const slopeScore = 1 - slopeSimilarity;
  const convergenceScore = Math.min(1, (firstPeak.price - lastPeak.price) / firstPeak.price + (lastValley.price - firstValley.price) / firstValley.price);
  const confidence = (slopeScore + convergenceScore) / 2;

  return {
    match: true,
    confidence,
    meta: {
      resistanceSlope,
      supportSlope,
      slopeSimilarity,
      convergenceAngle: Math.abs(resistanceSlope) + Math.abs(supportSlope),
      peakCount: peaks.length,
      valleyCount: valleys.length
    }
  };
}

const spec = {
  name: "symmetrical-triangle",
  type: "chart-patterns",
  minCandles: 25,
  shapeOnly: true,
  description: "Líneas de soporte y resistencia que convergen, indica consolidación.",
  typicalPrediction: "ruptura en cualquier dirección",
  commonContext: "en mercados laterales, indica que el precio está comprimiéndose para una ruptura"
};

module.exports = {
  detectSymmetricalTriangle,
  spec
};
