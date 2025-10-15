/**
 * SAVP Algorithm Configuration
 * Sweep-Absorption + VWAP Pinch + Liquidity Walls
 */

export type SavpOptions = {
  windowBlocks?: number;
  sweepLookback?: number;
  sweepMinTicks?: number;
  vwapPinchWindowMin?: number;
  percentiles?: { p35: number; p40: number; p50: number; p60: number; p80: number; p85: number; };
  scoreThreshold?: number;
  atrTP1x?: number;
  atrTP2x?: number;
  entryBufferTicks?: number;
  srProximityPct?: number; // % del precio
  regime?: { minAtrPctPctl: number; maxSpreadPctPctl: number; minTickVolPctl: number; };
  scoring?: { sweep: number; absorption: number; vwapPinch: number; walls: number; context: number; };
  cooldownPerBlock?: boolean;
};

export const SAVP_DEFAULTS: SavpOptions = {
  windowBlocks: 72,
  sweepLookback: 12,
  sweepMinTicks: 3,
  vwapPinchWindowMin: 7,
  percentiles: { p35: 0.35, p40: 0.40, p50: 0.50, p60: 0.60, p80: 0.80, p85: 0.85 },
  scoreThreshold: 84,             // sube a 86 si quieres aún menos señales
  atrTP1x: 1.0,
  atrTP2x: 1.8,
  entryBufferTicks: 2,
  srProximityPct: 0.15,
  regime: { minAtrPctPctl: 0.30, maxSpreadPctPctl: 0.70, minTickVolPctl: 0.20 },
  scoring: { sweep: 25, absorption: 30, vwapPinch: 25, walls: 10, context: 10 },
  cooldownPerBlock: true,
};
