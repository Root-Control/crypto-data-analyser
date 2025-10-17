/**
 * Double Bottom Pattern Detection
 * Shape-only detection without validation or confirmation
 */

const { findValleys, calculatePriceTolerance } = require('../utils');

function detectDoubleBottom(candles, index, windowSize = 30) {
  if (index + windowSize >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const window = candles.slice(index, index + windowSize);

  // Find valleys in the window
  const valleys = findValleys(window, 3);

  if (valleys.length < 2) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Get the two lowest valleys
  const sortedValleys = valleys.sort((a, b) => a.price - b.price);
  const valley1 = sortedValleys[0];
  const valley2 = sortedValleys[1];

  // Check if valleys are similar in price (within 1% tolerance)
  const priceSimilarity = calculatePriceTolerance(valley1.price, valley2.price, 0.01);

  if (!priceSimilarity) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Check if there's a peak between the valleys
  const peakIndex = Math.min(valley1.index, valley2.index) + 1;
  const peakEndIndex = Math.max(valley1.index, valley2.index) - 1;

  if (peakIndex >= peakEndIndex) {
    return { match: false, confidence: 0, meta: {} };
  }

  let peakHigh = window[peakIndex].high;
  for (let i = peakIndex; i <= peakEndIndex; i++) {
    peakHigh = Math.max(peakHigh, window[i].high);
  }

  // Peak should be at least 2% above the valleys
  const peakHeight = (peakHigh - valley1.price) / valley1.price;

  if (peakHeight < 0.02) {
    return { match: false, confidence: 0, meta: {} };
  }

  // Calculate confidence based on pattern quality
  const priceMatch = 1 - Math.abs(valley1.price - valley2.price) / ((valley1.price + valley2.price) / 2);
  const heightScore = Math.min(1, peakHeight / 0.05); // Normalize to 5% height
  const confidence = (priceMatch + heightScore) / 2;

  return {
    match: true,
    confidence,
    meta: {
      valley1Price: valley1.price,
      valley2Price: valley2.price,
      peakHigh,
      peakHeight,
      priceDifference: Math.abs(valley1.price - valley2.price),
      priceSimilarity: priceMatch
    }
  };
}

const spec = {
  name: "double-bottom",
  type: "chart",
  minCandles: 30,
  shapeOnly: true,
  description: "Dos valles similares con pico entre ellos, patrón de reversión alcista.",
  typicalPrediction: "reversión alcista",
  commonContext: "después de una tendencia bajista, cuando el precio no puede romper soporte dos veces"
};

module.exports = {
  detectDoubleBottom,
  spec
};
