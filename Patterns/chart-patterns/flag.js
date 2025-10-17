/**
 * Flag Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectFlag(candles, index, windowSize = 20) {
  if (index + windowSize >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const window = candles.slice(index, index + windowSize);

  // Flag pattern: small rectangular consolidation after strong move
  // 1. Need a strong initial move (flagpole)
  // 2. Followed by small rectangular consolidation
  
  // Check for strong initial move (first 25% of window)
  const poleLength = Math.floor(windowSize * 0.25);
  const poleStart = window[0];
  const poleEnd = window[poleLength - 1];
  
  const poleMove = Math.abs(poleEnd.close - poleStart.close);
  const poleMovePercent = poleMove / poleStart.close;
  
  // Need at least 2% move for flagpole
  if (poleMovePercent < 0.02) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Check consolidation phase (remaining 75% of window)
  const consolidationStart = poleLength;
  const consolidationEnd = windowSize;
  const consolidationWindow = window.slice(consolidationStart, consolidationEnd);
  
  if (consolidationWindow.length < 10) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Find consolidation range (resistance and support)
  let maxHigh = consolidationWindow[0].high;
  let minLow = consolidationWindow[0].low;
  
  for (const candle of consolidationWindow) {
    maxHigh = Math.max(maxHigh, candle.high);
    minLow = Math.min(minLow, candle.low);
  }
  
  const consolidationRange = maxHigh - minLow;
  const consolidationRangePercent = consolidationRange / poleEnd.close;
  
  // Consolidation should be small (less than 1.5% of price)
  if (consolidationRangePercent > 0.015) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Check if consolidation is roughly horizontal (not trending)
  const consolidationStartPrice = consolidationWindow[0].close;
  const consolidationEndPrice = consolidationWindow[consolidationWindow.length - 1].close;
  const consolidationTrend = Math.abs(consolidationEndPrice - consolidationStartPrice) / consolidationStartPrice;
  
  // Consolidation trend should be small (less than 0.5%)
  if (consolidationTrend > 0.005) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Calculate confidence based on pattern quality
  const poleStrength = Math.min(1, poleMovePercent / 0.05); // Normalize to 5% move
  const consolidationQuality = Math.max(0, (0.015 - consolidationRangePercent) / 0.015);
  const horizontalQuality = Math.max(0, (0.005 - consolidationTrend) / 0.005);
  
  const confidence = (poleStrength + consolidationQuality + horizontalQuality) / 3;
  
  return {
    match: true,
    confidence,
    meta: {
      poleMove: poleMove,
      poleMovePercent: poleMovePercent,
      consolidationRange: consolidationRange,
      consolidationRangePercent: consolidationRangePercent,
      consolidationTrend: consolidationTrend,
      resistanceLevel: maxHigh,
      supportLevel: minLow
    }
  };
}

const spec = {
  name: "flag",
  type: "chart-patterns",
  minCandles: 20,
  shapeOnly: true,
  description: "Pequeña consolidación rectangular después de un movimiento fuerte.",
  typicalPrediction: "continuación de la tendencia",
  commonContext: "después de movimientos fuertes, indica pausa antes de continuar en la misma dirección"
};

module.exports = {
  detectFlag,
  spec
};
