import { HistoricalCandle, BookSnapshot } from './book.types';

/**
 * Marubozu Follow Score Configuration
 */
export interface MarubozuConfig {
  atrLen?: number; // ATR period length (default: 14)
  volLookback?: number; // Volume lookback period (default: 20)
  percentileLookback?: number; // Percentile lookback for liquidity levels (default: 200)
}

/**
 * Marubozu Follow Score Result
 */
export interface MarubozuFollowScore {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bodyPct: number; // Body percentage of total range
  trOverAtr: number; // True Range over ATR ratio
  volZ: number; // Volume Z-score
  takerDominance: number; // Taker dominance ratio (0-1)
  structureBroke: boolean; // Whether price broke recent structure
  htfAligned: boolean; // Higher timeframe alignment
  vwapStretchOk: boolean; // VWAP stretch within acceptable range
  followThroughOk: boolean; // Follow-through criteria met
  score: number; // Final score (0-10)
  decision: 'FOLLOW' | 'CAUTION' | 'NO_FOLLOW';
  invalidation: {
    retraceOver50: boolean; // Next candle retraced >50% of body
    backInsideRange: boolean; // Price returned inside previous range
    reason: string; // Invalidation reason
  };
}

/**
 * Marubozu Targets
 */
export interface MarubozuTargets {
  sl: number; // Stop Loss level
  tp1: number; // Take Profit 1 level
  tp2: number; // Take Profit 2 level
  trailing: {
    type: 'HL2' | 'ATR'; // Trailing type
    atrMult?: number; // ATR multiplier for ATR trailing
  };
  rrToTp1: number; // Risk/Reward ratio to TP1
  rrToTp2: number; // Risk/Reward ratio to TP2
}

/**
 * Liquidity Levels
 */
export interface LiquidityLevels {
  near: {
    level: number;
    type: 'SWING' | 'ROUND_FIGURE' | 'VAH_VAL' | 'OR' | 'ATR';
    distance: number;
  };
  far: {
    level: number;
    type: 'SWING' | 'ROUND_FIGURE' | 'VAH_VAL' | 'OR' | 'ATR';
    distance: number;
  };
}

/**
 * Higher Timeframe Context
 */
export interface HTFContext {
  ema20?: number;
  ema50?: number;
  bias?: 'UP' | 'DOWN' | 'NEUTRAL';
}

/**
 * Marubozu Analysis Input
 */
export interface MarubozuAnalysisInput {
  candles: HistoricalCandle[];
  book?: BookSnapshot;
  htf?: HTFContext;
  config?: MarubozuConfig;
}

/**
 * Marubozu Analysis Result
 */
export interface MarubozuAnalysisResult {
  score: MarubozuFollowScore;
  targets: MarubozuTargets;
  liquidity: LiquidityLevels;
  isValid: boolean;
  reason?: string;
}

/**
 * Telemetry Metrics
 */
export interface MarubozuTelemetry {
  totalAnalyses: number;
  followCount: number;
  cautionCount: number;
  noFollowCount: number;
  invalidationCount: number;
  avgScore: number;
  avgRR: number;
  followThroughSuccess: number;
  liquidityUsage: {
    swing: number;
    roundFigure: number;
    vahVal: number;
    or: number;
    atr: number;
  };
}
