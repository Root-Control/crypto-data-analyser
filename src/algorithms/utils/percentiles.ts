/**
 * Percentile utilities for SAVP algorithm
 */

/**
 * Calculate rolling percentile using quickselect
 */
export function rollingPercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(p * (sorted.length - 1));
  return sorted[index];
}

/**
 * Normalize value to percentile position (0-1) within baseline array
 */
export function normalizeToPercentile(value: number, baseline: number[]): number {
  if (baseline.length === 0) return 0.5;
  
  const sorted = [...baseline].sort((a, b) => a - b);
  let rank = 0;
  
  for (const v of sorted) {
    if (value > v) rank++;
    else break;
  }
  
  return rank / sorted.length;
}

/**
 * Calculate ATR percentage over a window
 */
export function calculateAtrPercent(values: number[], window: number = 14): number {
  if (values.length < 2) return 0;
  
  const returns = [];
  for (let i = 1; i < values.length; i++) {
    returns.push(Math.abs(values[i] - values[i - 1]) / values[i - 1]);
  }
  
  if (returns.length === 0) return 0;
  
  const windowSize = Math.min(window, returns.length);
  const recentReturns = returns.slice(-windowSize);
  const avgReturn = recentReturns.reduce((sum, r) => sum + r, 0) / recentReturns.length;
  
  return avgReturn * 100; // Convert to percentage
}
