/**
 * Inverse Head and Shoulders Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { findValleys, calculatePriceTolerance } = require('../utils');

function detectInverseHeadAndShoulders(candles, index, windowSize = 50) {
  if (index + windowSize >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const window = candles.slice(index, index + windowSize);

  // Find valleys in the window
  const valleys = findValleys(window, 5);

  if (valleys.length < 3) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Sort valleys by price (lowest first)
  const sortedValleys = valleys.sort((a, b) => a.price - b.price);

  // Get the three lowest valleys
  const head = sortedValleys[0]; // Lowest valley
  const leftShoulder = sortedValleys[1]; // Second lowest
  const rightShoulder = sortedValleys[2]; // Third lowest

  // Check if valleys are in correct order (left shoulder, head, right shoulder)
  if (!(leftShoulder.index < head.index && head.index < rightShoulder.index)) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Head should be lower than both shoulders
  if (head.price >= leftShoulder.price || head.price >= rightShoulder.price) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Shoulders should be similar in height (within 2% tolerance)
  const shoulderSimilarity = calculatePriceTolerance(leftShoulder.price, rightShoulder.price, 0.02);
  if (!shoulderSimilarity) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence based on pattern quality
  const shoulderMatch = 1 - Math.abs(leftShoulder.price - rightShoulder.price) / ((leftShoulder.price + rightShoulder.price) / 2);
  const headProminence = (Math.min(leftShoulder.price, rightShoulder.price) - head.price) / head.price;
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
  name: "inverse-head-and-shoulders",
  type: "chart-patterns",
  minCandles: 50,
  shapeOnly: true,
  description: "Tres valles donde el del medio es más bajo, patrón de reversión alcista.",
  typicalPrediction: "reversión alcista",
  commonContext: "al final de tendencias bajistas largas, indica que la caída está terminando"
};

module.exports = {
  detectInverseHeadAndShoulders,
  spec
};
