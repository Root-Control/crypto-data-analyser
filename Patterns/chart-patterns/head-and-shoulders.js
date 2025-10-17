/**
 * Head and Shoulders Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { findPeaks, calculatePriceTolerance } = require('../utils');

function detectHeadAndShoulders(candles, index, windowSize = 50) {
  if (index + windowSize >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const window = candles.slice(index, index + windowSize);

  // Find peaks in the window
  const peaks = findPeaks(window, 5);

  if (peaks.length < 3) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Sort peaks by price (highest first)
  const sortedPeaks = peaks.sort((a, b) => b.price - a.price);

  // Get the three highest peaks
  const head = sortedPeaks[0]; // Highest peak
  const leftShoulder = sortedPeaks[1]; // Second highest
  const rightShoulder = sortedPeaks[2]; // Third highest

  // Check if peaks are in correct order (left shoulder, head, right shoulder)
  if (!(leftShoulder.index < head.index && head.index < rightShoulder.index)) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Head should be higher than both shoulders
  if (head.price <= leftShoulder.price || head.price <= rightShoulder.price) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Shoulders should be similar in height (within 2% tolerance)
  const shoulderSimilarity = calculatePriceTolerance(leftShoulder.price, rightShoulder.price, 0.02);
  if (!shoulderSimilarity) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence based on pattern quality
  const shoulderMatch = 1 - Math.abs(leftShoulder.price - rightShoulder.price) / ((leftShoulder.price + rightShoulder.price) / 2);
  const headProminence = (head.price - Math.max(leftShoulder.price, rightShoulder.price)) / head.price;
  const confidence = (shoulderMatch + Math.min(1, headProminence * 10)) / 2;

  return {
    match: true,
    confidence,
    meta: {
      headPrice: head.price,
      leftShoulderPrice: leftShoulder.price,
      rightShoulderPrice: rightShoulder.price,
      headProminence,
      shoulderSimilarity: shoulderMatch,
      timeSpan: rightShoulder.index - leftShoulder.index
    }
  };
}

const spec = {
  name: "head-and-shoulders",
  type: "chart",
  minCandles: 50,
  shapeOnly: true,
  description: "Tres picos donde el del medio es más alto, patrón de reversión bajista.",
  typicalPrediction: "reversión bajista",
  commonContext: "al final de tendencias alcistas largas, indica que la subida está terminando"
};

module.exports = {
  detectHeadAndShoulders,
  spec
};
