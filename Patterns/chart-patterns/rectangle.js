/**
 * Rectangle Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectRectangle(candles, index, windowSize = 20) {
  if (index + windowSize >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const window = candles.slice(index, index + windowSize);

  // Rectangle pattern: horizontal trading range with clear support and resistance
  // 1. Price oscillates between two horizontal levels
  // 2. Multiple touches of both support and resistance
  // 3. Relatively flat trend (no strong directional bias)
  
  // Find overall high and low of the window
  let maxHigh = window[0].high;
  let minLow = window[0].low;
  
  for (const candle of window) {
    maxHigh = Math.max(maxHigh, candle.high);
    minLow = Math.min(minLow, candle.low);
  }
  
  const totalRange = maxHigh - minLow;
  const totalRangePercent = totalRange / window[0].close;
  
  // Range should be reasonable (between 1% and 5% of price)
  if (totalRangePercent < 0.01 || totalRangePercent > 0.05) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Define tolerance for support and resistance levels
  const tolerance = totalRange * 0.1; // 10% of total range
  
  // Count touches of resistance (near maxHigh)
  let resistanceTouches = 0;
  let supportTouches = 0;
  
  for (const candle of window) {
    // Check if candle touched resistance (within tolerance)
    if (candle.high >= maxHigh - tolerance) {
      resistanceTouches++;
    }
    
    // Check if candle touched support (within tolerance)
    if (candle.low <= minLow + tolerance) {
      supportTouches++;
    }
  }
  
  // Need at least 3 touches of each level for a good rectangle
  if (resistanceTouches < 3 || supportTouches < 3) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Check for horizontal trend (not trending up or down)
  const startPrice = window[0].close;
  const endPrice = window[window.length - 1].close;
  const priceChange = Math.abs(endPrice - startPrice);
  const priceChangePercent = priceChange / startPrice;
  
  // Price change should be small (less than 1% over the period)
  if (priceChangePercent > 0.01) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Check for consistent oscillation (not just bouncing once)
  let oscillationCount = 0;
  let lastDirection = null; // 'up' or 'down'
  
  for (let i = 1; i < window.length; i++) {
    const prevClose = window[i - 1].close;
    const currClose = window[i].close;
    
    let currentDirection = null;
    if (currClose > prevClose) {
      currentDirection = 'up';
    } else if (currClose < prevClose) {
      currentDirection = 'down';
    }
    
    // Count direction changes
    if (currentDirection && lastDirection && currentDirection !== lastDirection) {
      oscillationCount++;
    }
    
    if (currentDirection) {
      lastDirection = currentDirection;
    }
  }
  
  // Need at least 4 oscillations for a good rectangle
  if (oscillationCount < 4) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Calculate confidence based on pattern quality
  const rangeQuality = Math.max(0, (0.05 - totalRangePercent) / 0.05); // Better if smaller range
  const touchQuality = Math.min(1, (Math.min(resistanceTouches, supportTouches) - 3) / 2); // Better with more touches
  const horizontalQuality = Math.max(0, (0.01 - priceChangePercent) / 0.01); // Better if more horizontal
  const oscillationQuality = Math.min(1, oscillationCount / 8); // Better with more oscillations
  
  const confidence = (rangeQuality + touchQuality + horizontalQuality + oscillationQuality) / 4;
  
  return {
    match: true,
    confidence,
    meta: {
      totalRange: totalRange,
      totalRangePercent: totalRangePercent,
      resistanceTouches: resistanceTouches,
      supportTouches: supportTouches,
      priceChange: priceChange,
      priceChangePercent: priceChangePercent,
      oscillationCount: oscillationCount,
      resistanceLevel: maxHigh,
      supportLevel: minLow,
      tolerance: tolerance
    }
  };
}

const spec = {
  name: "rectangle",
  type: "chart-patterns",
  minCandles: 20,
  shapeOnly: true,
  description: "Rango lateral con soporte y resistencia claros.",
  typicalPrediction: "ruptura en cualquier dirección",
  commonContext: "en mercados laterales, indica que el precio está atrapado entre dos niveles"
};

module.exports = {
  detectRectangle,
  spec
};
