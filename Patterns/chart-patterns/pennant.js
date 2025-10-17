/**
 * Pennant Pattern Detection
 * Shape-only detection without validation or confirmation
 */

function detectPennant(candles, index, windowSize = 20) {
  if (index + windowSize >= candles.length) {
    return { match: false, confidence: 0, meta: {} };
  }

  const window = candles.slice(index, index + windowSize);

  // Pennant pattern: small triangular consolidation after strong move
  // 1. Need a strong initial move (flagpole)
  // 2. Followed by small triangular consolidation (converging lines)
  
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
  
  // Check triangular consolidation phase (remaining 75% of window)
  const consolidationStart = poleLength;
  const consolidationEnd = windowSize;
  const consolidationWindow = window.slice(consolidationStart, consolidationEnd);
  
  if (consolidationWindow.length < 10) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Find convergence pattern (decreasing range over time)
  const consolidationLength = consolidationWindow.length;
  const firstHalf = consolidationWindow.slice(0, Math.floor(consolidationLength / 2));
  const secondHalf = consolidationWindow.slice(Math.floor(consolidationLength / 2));
  
  // Calculate ranges for each half
  let firstHalfMaxHigh = firstHalf[0].high;
  let firstHalfMinLow = firstHalf[0].low;
  for (const candle of firstHalf) {
    firstHalfMaxHigh = Math.max(firstHalfMaxHigh, candle.high);
    firstHalfMinLow = Math.min(firstHalfMinLow, candle.low);
  }
  
  let secondHalfMaxHigh = secondHalf[0].high;
  let secondHalfMinLow = secondHalf[0].low;
  for (const candle of secondHalf) {
    secondHalfMaxHigh = Math.max(secondHalfMaxHigh, candle.high);
    secondHalfMinLow = Math.min(secondHalfMinLow, candle.low);
  }
  
  const firstHalfRange = firstHalfMaxHigh - firstHalfMinLow;
  const secondHalfRange = secondHalfMaxHigh - secondHalfMinLow;
  
  // Second half should have smaller range (convergence)
  const convergenceRatio = secondHalfRange / firstHalfRange;
  
  // Good convergence should be less than 0.7 (30% reduction)
  if (convergenceRatio > 0.7) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Check if overall consolidation is small (less than 2% of price)
  const overallMaxHigh = Math.max(firstHalfMaxHigh, secondHalfMaxHigh);
  const overallMinLow = Math.min(firstHalfMinLow, secondHalfMinLow);
  const overallRange = overallMaxHigh - overallMinLow;
  const overallRangePercent = overallRange / poleEnd.close;
  
  if (overallRangePercent > 0.02) {
    return { match: false, confidence: 0, meta: {} };
  }
  
  // Check for triangular shape (resistance and support lines converging)
  // Simple check: later candles should have smaller high-low ranges
  const earlyRange = (firstHalfMaxHigh - firstHalfMinLow) / poleEnd.close;
  const lateRange = (secondHalfMaxHigh - secondHalfMinLow) / poleEnd.close;
  
  // Calculate confidence based on pattern quality
  const poleStrength = Math.min(1, poleMovePercent / 0.05); // Normalize to 5% move
  const convergenceQuality = Math.max(0, (0.7 - convergenceRatio) / 0.7);
  const sizeQuality = Math.max(0, (0.02 - overallRangePercent) / 0.02);
  const triangularQuality = Math.max(0, (earlyRange - lateRange) / earlyRange);
  
  const confidence = (poleStrength + convergenceQuality + sizeQuality + triangularQuality) / 4;
  
  return {
    match: true,
    confidence,
    meta: {
      poleMove: poleMove,
      poleMovePercent: poleMovePercent,
      firstHalfRange: firstHalfRange,
      secondHalfRange: secondHalfRange,
      convergenceRatio: convergenceRatio,
      overallRange: overallRange,
      overallRangePercent: overallRangePercent,
      resistanceLevel: overallMaxHigh,
      supportLevel: overallMinLow
    }
  };
}

const spec = {
  name: "pennant",
  type: "chart-patterns",
  minCandles: 20,
  shapeOnly: true,
  description: "Consolidación triangular después de un movimiento fuerte.",
  typicalPrediction: "continuación de la tendencia",
  commonContext: "después de movimientos fuertes, indica pausa antes de continuar en la misma dirección"
};

module.exports = {
  detectPennant,
  spec
};
