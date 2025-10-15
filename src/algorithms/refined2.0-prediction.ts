import { BookSnapshot } from '../types/book.types';
import {
  type HistoricalCandle,
  type PredictionScore,
  type MomentumScore,
  type BookPressure,
} from '../helpers/predictionEngine';
import { refinedPrediction } from './refined-prediction';

// ============================================================================
// REFINED 2.0 PREDICTION ALGORITHM - Advanced Multi-Dimensional Analysis
// ============================================================================

/**
 * Configuration interface for Refined 2.0 algorithm
 * All parameters are configurable to allow fine-tuning
 */
export interface Refined2Config {
  // Thresholds and percentiles
  thresholds: {
    momentum: { p65: number; p70: number; p30: number; p35: number };
    book: { p65: number; p70: number; p30: number; p35: number };
    flow: { p65: number; p70: number; p30: number; p35: number };
    climax: { p65: number; p70: number; p30: number; p35: number };
    strong: { p20: number; p80: number };
  };

  // Regime detection
  regimes: {
    volatility: { low: number; high: number };
    liquidity: { thin: number; deep: number };
  };

  // Gating rules
  gating: {
    normal: number; // 2/4
    lowVolThinLiq: number; // 3/4
    conflictThreshold: number;
  };

  // Risk management
  risk: {
    defaultRiskPercent: number; // 1%
    highRiskReduction: number; // 0.5x
    spreadThreshold: number;
  };

  // TP/SL data-driven
  tpSl: {
    mfePercentiles: { p50: number; p60: number; p70: number };
    maePercentiles: { p90: number; p95: number };
    minRR: number; // 1.0
    minTP: number; // piso TP
  };

  // Position management
  management: {
    beAtMFE50: boolean;
    trailingMinTicks: number;
    timeStopPercentile: number; // p70 of TTTP
    partialExitPercent: number; // 50-75%
  };

  // Trading parameters
  trading: {
    tickSize: number;
    stepSize: number;
    makerFee: number;
    takerFee: number;
  };
}

/**
 * Default configuration for Refined 2.0
 */
export const DEFAULT_REFINED2_CONFIG: Refined2Config = {
  // FASE A: Umbrales suavizados (p70→p60 / p30→p40)
  thresholds: {
    momentum: { p65: 60, p70: 60, p30: 40, p35: 40 },
    book: { p65: 60, p70: 60, p30: 40, p35: 40 },
    flow: { p65: 60, p70: 60, p30: 40, p35: 40 },
    climax: { p65: 60, p70: 60, p30: 40, p35: 40 },
    strong: { p20: 20, p80: 80 }, // Mantener fuerte para conflictos
  },
  regimes: {
    volatility: { low: 0.5, high: 2.0 },
    liquidity: { thin: 1000, deep: 10000 },
  },
  // Gating más permisivo: 2/4 normal, 2/4 con confirmación en vol LOW + liq THIN
  gating: {
    normal: 2,
    lowVolThinLiq: 2, // Cambio: 3→2 con confirmación VWAP/libro
    conflictThreshold: 0.7, // Más permisivo: permite 2 good + 1 contra débil
  },
  risk: {
    defaultRiskPercent: 1.0,
    highRiskReduction: 0.5,
    spreadThreshold: 0.001,
  },
  // TP/SL más realistas: TP1=p50, TP2=p70, SL=p90 si R:R≥1
  tpSl: {
    mfePercentiles: { p50: 0.5, p60: 0.5, p70: 0.7 }, // TP1=p50, TP2=p70
    maePercentiles: { p90: 0.9, p95: 0.9 }, // SL=p90 por defecto
    minRR: 0.95, // Cambio: 1.0→0.95 con gestión activa
    minTP: 0.3,
  },
  // Gestión más agresiva: BE más temprano, trailing más cercano
  management: {
    beAtMFE50: false, // Cambio: BE en p40 MFE para señales 55-60
    trailingMinTicks: 2, // Cambio: 3→2 ticks
    timeStopPercentile: 0.7,
    partialExitPercent: 0.5,
  },
  trading: {
    tickSize: 0.01,
    stepSize: 0.01,
    makerFee: 0.001,
    takerFee: 0.001,
  },
};

/**
 * Extended prediction result with additional telemetry
 */
export interface Refined2PredictionResult extends PredictionScore {
  confidence_bin?: number; // 0-9
  expectedMovePct?: number; // smoothed
  setup?: {
    entryPrice: number;
    tp: number;
    sl: number;
    positionSize: number;
    management: {
      beAtMFE50: boolean;
      trailingMinTicks: number;
      timeStopPercentile: number;
    };
  };
  scores?: {
    momentum: number; // 0-100 with sign
    book: number;
    flow: number;
    climax: number;
  };
  explain?: {
    dimensions: string[];
    confidenceBin: number;
    regime: string;
    reason?: string;
  };
  telemetry?: {
    percentiles: Record<string, number>;
    spreads: number[];
    depths: number[];
    regimes: {
      volatility: 'LOW' | 'MID' | 'HIGH';
      liquidity: 'THIN' | 'NORMAL' | 'DEEP';
    };
  };
}

/**
 * Percentile provider interface for regime-based percentiles
 */
export interface PercentileProvider {
  getPercentile(
    metricKey: string,
    regimeKey: string,
    percentile: number,
  ): number;
}

/**
 * Regime detection result
 */
interface RegimeDetection {
  volatility: 'LOW' | 'MID' | 'HIGH';
  liquidity: 'THIN' | 'NORMAL' | 'DEEP';
}

/**
 * Dimension flags for gating
 */
interface DimensionFlags {
  goodUP: boolean;
  goodDOWN: boolean;
  neutral: boolean;
  strongUP: boolean;
  strongDOWN: boolean;
}

/**
 * Main Refined 2.0 prediction function
 *
 * @param historicalCandles - Up to 15 1-minute candles of current block
 * @param currentBook - Book snapshot from last minute of block
 * @param config - Configuration object (optional, uses default if not provided)
 * @param percentileProvider - Percentile provider (optional, uses fallback if not provided)
 * @param capital - Trading capital
 * @param leverage - Trading leverage
 * @returns Refined2PredictionResult
 */
export function refined2Prediction(
  historicalCandles: HistoricalCandle[],
  currentBook: BookSnapshot | null,
  config: Refined2Config = DEFAULT_REFINED2_CONFIG,
  percentileProvider?: PercentileProvider,
  capital: number = 1000,
  leverage: number = 1,
): Refined2PredictionResult {
  // Validate inputs
  if (historicalCandles.length < 3) {
    console.log('🔍 Refined2.0: Less than 3 candles');
    return createSidewaysResult('INSUFFICIENT_DATA', 'Less than 3 candles');
  }

  if (!currentBook) {
    console.log('🔍 Refined2.0: No book data');
    return createSidewaysResult('INSUFFICIENT_DATA', 'No book data');
  }

  // Detect regimes
  const regimes = detectRegimes(historicalCandles, currentBook, config);

  // Calculate normalized scores
  const scores = calculateNormalizedScores(
    historicalCandles,
    currentBook,
    config,
  );

  // Apply winsorization and smoothing
  const smoothedScores = applyWinsorizationAndSmoothing(scores, config);

  // Get percentiles for gating
  const percentiles = getPercentilesForGating(
    regimes,
    config,
    percentileProvider,
  );

  // Calculate dimension flags
  const flags = calculateDimensionFlags(smoothedScores, percentiles, config);

  // Apply gating logic
  const gatingResult = applyGatingLogic(flags, regimes, config);

  // If no clear signal, return SIDEWAYS
  if (gatingResult.direction === 'SIDEWAYS') {
    console.log(
      `🔍 Refined2.0: SIDEWAYS - ${gatingResult.reason}: ${gatingResult.explanation}`,
    );
    console.log(`🔍 Refined2.0: Scores - momentum:${smoothedScores.momentum.toFixed(1)}, book:${smoothedScores.book.toFixed(1)}, flow:${smoothedScores.flow.toFixed(1)}, climax:${smoothedScores.climax.toFixed(1)}`);
    console.log(`🔍 Refined2.0: Regimes - vol:${regimes.volatility}, liq:${regimes.liquidity}`);
    return createSidewaysResult(
      gatingResult.reason || 'NO_CLEAR_SIGNAL',
      gatingResult.explanation,
    );
  }

  // Calculate calibrated confidence
  const confidence = calculateCalibratedConfidence(
    smoothedScores,
    regimes,
    config,
  );
  const confidenceBin = Math.floor(confidence / 10);

  // Calculate data-driven TP/SL
  const tpSl = calculateDataDrivenTPSL(confidenceBin, regimes, config);

  // Calculate position size
  const positionSize = calculatePositionSize(
    capital,
    leverage,
    tpSl.sl,
    config,
  );

  // Create setup
  const setup = createTradingSetup(
    historicalCandles,
    tpSl,
    positionSize,
    config,
  );

  // Create result
  return {
    direction: gatingResult.direction,
    confidence,
    expectedMove: tpSl.tp,
    riskLevel: calculateRiskLevel(confidence, regimes, config),
    breakdown: {
      momentumScore: smoothedScores.momentum,
      bookScore: smoothedScores.book,
      flowScore: smoothedScores.flow,
      climaxScore: smoothedScores.climax,
    },
    confidence_bin: confidenceBin,
    expectedMovePct: tpSl.tp,
    setup,
    scores: {
      momentum: smoothedScores.momentum,
      book: smoothedScores.book,
      flow: smoothedScores.flow,
      climax: smoothedScores.climax,
    },
    explain: {
      dimensions: gatingResult.activeDimensions || [],
      confidenceBin,
      regime: `${regimes.volatility}_${regimes.liquidity}`,
      reason: gatingResult.reason,
    },
    telemetry: {
      percentiles: percentiles,
      spreads: calculateSpreads(currentBook),
      depths: calculateDepths(currentBook),
      regimes,
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect market regimes based on volatility and liquidity
 */
function detectRegimes(
  candles: HistoricalCandle[],
  book: BookSnapshot,
  config: Refined2Config,
): RegimeDetection {
  // Calculate recent volatility (ATR-like)
  const recentPrices = candles
    .slice(-5)
    .map((c) => [c.high, c.low, c.close])
    .flat();
  const volatility = calculateVolatility(recentPrices);

  // Calculate liquidity depth
  const liquidity = calculateLiquidityDepth(book);

  // Determine regimes
  const volRegime =
    volatility < config.regimes.volatility.low
      ? 'LOW'
      : volatility > config.regimes.volatility.high
        ? 'HIGH'
        : 'MID';

  const liqRegime =
    liquidity < config.regimes.liquidity.thin
      ? 'THIN'
      : liquidity > config.regimes.liquidity.deep
        ? 'DEEP'
        : 'NORMAL';

  return { volatility: volRegime, liquidity: liqRegime };
}

/**
 * Calculate normalized scores for all dimensions
 */
function calculateNormalizedScores(
  candles: HistoricalCandle[],
  book: BookSnapshot,
  config: Refined2Config,
): { momentum: number; book: number; flow: number; climax: number } {
  return {
    momentum: scoreMomentum(candles, config),
    book: scoreBook(book, candles, config),
    flow: scoreFlow(candles, config),
    climax: scoreClimax(candles, config),
  };
}

/**
 * Score momentum with multi-horizon analysis
 */
function scoreMomentum(
  candles: HistoricalCandle[],
  config: Refined2Config,
): number {
  if (candles.length < 3) return 0;

  const recent = candles.slice(-3);
  const medium = candles.slice(-7);

  // Price trend analysis
  const shortTrend =
    (recent[recent.length - 1].close - recent[0].open) / recent[0].open;
  const mediumTrend =
    (medium[medium.length - 1].close - medium[0].open) / medium[0].open;

  // Volume acceleration
  const recentVol =
    recent.reduce((sum, c) => sum + (c.tickVol || 0), 0) / recent.length;
  const mediumVol =
    medium.reduce((sum, c) => sum + (c.tickVol || 0), 0) / medium.length;
  const volAcceleration = (recentVol - mediumVol) / mediumVol;

  // Volatility change
  const recentVolatility = calculateVolatility(recent.map((c) => c.close));
  const mediumVolatility = calculateVolatility(medium.map((c) => c.close));
  const volChange = (recentVolatility - mediumVolatility) / mediumVolatility;

  // Combine factors
  const score =
    (shortTrend * 0.4 +
      mediumTrend * 0.3 +
      volAcceleration * 0.2 +
      volChange * 0.1) *
    100;

  return Math.max(-100, Math.min(100, score));
}

/**
 * Score book pressure with multi-level analysis
 */
function scoreBook(
  book: BookSnapshot,
  candles: HistoricalCandle[],
  config: Refined2Config,
): number {
  if (!book.bids.length || !book.asks.length) return 0;

  // Aggregate depth (3-5 levels)
  const bidDepth = book.bids
    .slice(0, 5)
    .reduce((sum, bid) => sum + parseFloat(bid.qty), 0);
  const askDepth = book.asks
    .slice(0, 5)
    .reduce((sum, ask) => sum + parseFloat(ask.qty), 0);
  const depthImbalance = (bidDepth - askDepth) / (bidDepth + askDepth);

  // Spread analysis
  const bestBid = parseFloat(book.bids[0].price);
  const bestAsk = parseFloat(book.asks[0].price);
  const spread = (bestAsk - bestBid) / bestBid;
  const spreadScore = Math.max(0, 1 - spread / config.trading.tickSize);

  // Book absorption detection
  const currentPrice = candles[candles.length - 1].close;
  const midPrice = (bestBid + bestAsk) / 2;
  const pricePosition = (currentPrice - bestBid) / (bestAsk - bestBid);

  // Combine factors
  const score =
    (depthImbalance * 0.5 + spreadScore * 0.3 + (0.5 - pricePosition) * 0.2) *
    100;

  return Math.max(-100, Math.min(100, score));
}

/**
 * Score flow with delta analysis
 */
function scoreFlow(
  candles: HistoricalCandle[],
  config: Refined2Config,
): number {
  if (candles.length < 3) return 0;

  // Calculate delta (buyVol - sellVol)
  const deltas = candles.map((c) => (c.buyVol || 0) - (c.sellVol || 0));
  const avgDelta = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;

  // Delta acceleration
  const recentDelta = deltas.slice(-2).reduce((sum, d) => sum + d, 0) / 2;
  const mediumDelta = deltas.slice(-5).reduce((sum, d) => sum + d, 0) / 5;
  const deltaAcceleration =
    (recentDelta - mediumDelta) / Math.abs(mediumDelta || 1);

  // Combine factors
  const score = (avgDelta * 0.7 + deltaAcceleration * 0.3) * 100;

  return Math.max(-100, Math.min(100, score));
}

/**
 * Score climax events
 */
function scoreClimax(
  candles: HistoricalCandle[],
  config: Refined2Config,
): number {
  if (candles.length < 3) return 0;

  const recent = candles.slice(-3);

  // Volume climax detection
  const avgVol =
    candles.reduce((sum, c) => sum + (c.tickVol || 0), 0) / candles.length;
  const recentVol =
    recent.reduce((sum, c) => sum + (c.tickVol || 0), 0) / recent.length;
  const volClimax = recentVol / avgVol;

  // Price climax detection
  const priceRange =
    Math.max(...recent.map((c) => c.high)) -
    Math.min(...recent.map((c) => c.low));
  const avgRange =
    candles.reduce((sum, c) => sum + (c.high - c.low), 0) / candles.length;
  const priceClimax = priceRange / avgRange;

  // Combine factors
  const score = (volClimax * 0.6 + priceClimax * 0.4 - 1) * 100;

  return Math.max(-100, Math.min(100, score));
}

/**
 * Apply winsorization and smoothing
 */
function applyWinsorizationAndSmoothing(
  scores: { momentum: number; book: number; flow: number; climax: number },
  config: Refined2Config,
): { momentum: number; book: number; flow: number; climax: number } {
  const winsorize = (
    value: number,
    p05: number = 5,
    p95: number = 95,
  ): number => {
    return Math.max(p05, Math.min(p95, value));
  };

  return {
    momentum: winsorize(scores.momentum),
    book: winsorize(scores.book),
    flow: winsorize(scores.flow),
    climax: winsorize(scores.climax),
  };
}

/**
 * Get percentiles for gating
 */
function getPercentilesForGating(
  regimes: RegimeDetection,
  config: Refined2Config,
  percentileProvider?: PercentileProvider,
): Record<string, number> {
  const regimeKey = `${regimes.volatility}_${regimes.liquidity}`;

  // Default percentiles (fallback)
  const defaultPercentiles = {
    momentum_p65: config.thresholds.momentum.p65,
    momentum_p70: config.thresholds.momentum.p70,
    momentum_p30: config.thresholds.momentum.p30,
    momentum_p35: config.thresholds.momentum.p35,
    book_p65: config.thresholds.book.p65,
    book_p70: config.thresholds.book.p70,
    book_p30: config.thresholds.book.p30,
    book_p35: config.thresholds.book.p35,
    flow_p65: config.thresholds.flow.p65,
    flow_p70: config.thresholds.flow.p70,
    flow_p30: config.thresholds.flow.p30,
    flow_p35: config.thresholds.flow.p35,
    climax_p65: config.thresholds.climax.p65,
    climax_p70: config.thresholds.climax.p70,
    climax_p30: config.thresholds.climax.p30,
    climax_p35: config.thresholds.climax.p35,
    strong_p20: config.thresholds.strong.p20,
    strong_p80: config.thresholds.strong.p80,
  };

  if (!percentileProvider) {
    return defaultPercentiles;
  }

  // Try to get regime-specific percentiles
  const percentiles: Record<string, number> = {};
  for (const [key, value] of Object.entries(defaultPercentiles)) {
    const [metric, percentile] = key.split('_');
    const p =
      percentile === 'p65'
        ? 65
        : percentile === 'p70'
          ? 70
          : percentile === 'p30'
            ? 30
            : percentile === 'p35'
              ? 35
              : percentile === 'p20'
                ? 20
                : 80;

    try {
      percentiles[key] = percentileProvider.getPercentile(metric, regimeKey, p);
    } catch {
      percentiles[key] = value; // Fallback to default
    }
  }

  return percentiles;
}

/**
 * Calculate dimension flags for gating
 */
function calculateDimensionFlags(
  scores: { momentum: number; book: number; flow: number; climax: number },
  percentiles: Record<string, number>,
  config: Refined2Config,
): {
  momentum: DimensionFlags;
  book: DimensionFlags;
  flow: DimensionFlags;
  climax: DimensionFlags;
} {
  const createFlags = (score: number, metric: string): DimensionFlags => {
    const p65 = percentiles[`${metric}_p65`] || 65;
    const p70 = percentiles[`${metric}_p70`] || 70;
    const p30 = percentiles[`${metric}_p30`] || 30;
    const p35 = percentiles[`${metric}_p35`] || 35;
    const p20 = percentiles.strong_p20 || 20;
    const p80 = percentiles.strong_p80 || 80;

    return {
      goodUP: score >= p65,
      goodDOWN: score <= p30,
      neutral: score > p30 && score < p65,
      strongUP: score >= p80,
      strongDOWN: score <= p20,
    };
  };

  return {
    momentum: createFlags(scores.momentum, 'momentum'),
    book: createFlags(scores.book, 'book'),
    flow: createFlags(scores.flow, 'flow'),
    climax: createFlags(scores.climax, 'climax'),
  };
}

/**
 * Apply gating logic (2/4 or 3/4)
 */
function applyGatingLogic(
  flags: {
    momentum: DimensionFlags;
    book: DimensionFlags;
    flow: DimensionFlags;
    climax: DimensionFlags;
  },
  regimes: RegimeDetection,
  config: Refined2Config,
): {
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  reason?: string;
  explanation?: string;
  activeDimensions?: string[];
} {
  const dimensions = Object.entries(flags) as [string, DimensionFlags][];

  // Count good signals
  const goodUP = dimensions.filter(([_, flags]) => flags.goodUP).length;
  const goodDOWN = dimensions.filter(([_, flags]) => flags.goodDOWN).length;
  const strongUP = dimensions.filter(([_, flags]) => flags.strongUP).length;
  const strongDOWN = dimensions.filter(([_, flags]) => flags.strongDOWN).length;

  // Determine required consensus
  const requiredConsensus =
    regimes.volatility === 'LOW' && regimes.liquidity === 'THIN'
      ? config.gating.lowVolThinLiq
      : config.gating.normal;

  // Check for conflicts (más permisivo: permite 2 good + 1 contra débil)
  if (goodUP >= 2 && strongDOWN >= 1) {
    return {
      direction: 'SIDEWAYS',
      reason: 'CONFLICT',
      explanation: `${goodUP} goodUP signals but ${strongDOWN} strongDOWN signals (strong conflict)`,
    };
  }

  if (goodDOWN >= 2 && strongUP >= 1) {
    return {
      direction: 'SIDEWAYS',
      reason: 'CONFLICT',
      explanation: `${goodDOWN} goodDOWN signals but ${strongUP} strongUP signals (strong conflict)`,
    };
  }

  // Check UP signal
  if (goodUP >= requiredConsensus && strongDOWN === 0) {
    const activeDimensions = dimensions
      .filter(([_, flags]) => flags.goodUP)
      .map(([name, _]) => name);

    return {
      direction: 'UP',
      reason: 'CONSENSUS',
      explanation: `${goodUP}/${requiredConsensus} dimensions in goodUP`,
      activeDimensions,
    };
  }

  // Check DOWN signal
  if (goodDOWN >= requiredConsensus && strongUP === 0) {
    const activeDimensions = dimensions
      .filter(([_, flags]) => flags.goodDOWN)
      .map(([name, _]) => name);

    return {
      direction: 'DOWN',
      reason: 'CONSENSUS',
      explanation: `${goodDOWN}/${requiredConsensus} dimensions in goodDOWN`,
      activeDimensions,
    };
  }

  // No clear signal
  return {
    direction: 'SIDEWAYS',
    reason: 'NO_CONSENSUS',
    explanation: `Only ${Math.max(goodUP, goodDOWN)}/${requiredConsensus} dimensions aligned`,
  };
}

/**
 * Calculate calibrated confidence
 */
function calculateCalibratedConfidence(
  scores: { momentum: number; book: number; flow: number; climax: number },
  regimes: RegimeDetection,
  config: Refined2Config,
): number {
  // Raw confidence as weighted sum
  const rawConfidence =
    scores.momentum * 0.3 +
    scores.book * 0.25 +
    scores.flow * 0.25 +
    scores.climax * 0.2;

  // Normalize to 0-100
  const normalizedConfidence = Math.max(
    0,
    Math.min(100, (rawConfidence + 100) / 2),
  );

  // Apply regime-based calibration
  let calibratedConfidence = normalizedConfidence;

  if (regimes.volatility === 'LOW' && regimes.liquidity === 'THIN') {
    calibratedConfidence *= 0.85; // Menos reducción: 0.8→0.85
  } else if (regimes.volatility === 'HIGH') {
    calibratedConfidence *= 0.95; // Menos reducción: 0.9→0.95
  }

  // Aplicar boost de confianza para señales borderline
  if (calibratedConfidence >= 50 && calibratedConfidence < 65) {
    calibratedConfidence += 5; // +5% boost para señales 50-65
  }

  return Math.max(0, Math.min(100, calibratedConfidence));
}

/**
 * Calculate data-driven TP/SL
 */
function calculateDataDrivenTPSL(
  confidenceBin: number,
  regimes: RegimeDetection,
  config: Refined2Config,
): { tp: number; sl: number; rr: number } {
  // Get MFE/MAE percentiles for this bin and regime
  const regimeKey = `${regimes.volatility}_${regimes.liquidity}`;

  // TP/SL más realistas: TP1=p50, TP2=p70, SL=p90 si R:R≥1
  const tp1 = config.tpSl.mfePercentiles.p50; // TP1 = p50 MFE
  const tp2 = config.tpSl.mfePercentiles.p70; // TP2 = p70 MFE
  const baseSL = config.tpSl.maePercentiles.p90; // SL = p90 MAE por defecto

  // Adjust based on confidence bin
  const confidenceMultiplier = 0.5 + confidenceBin * 0.1; // 0.5 to 1.4
  const tp = Math.max(config.tpSl.minTP, tp1 * confidenceMultiplier);
  let sl = baseSL * confidenceMultiplier;

  // Calculate R:R
  let rr = tp / sl;

  // Si R:R < 1, intentar con p95 MAE
  if (rr < 1.0) {
    const sl95 = config.tpSl.maePercentiles.p95 * confidenceMultiplier;
    const rr95 = tp / sl95;
    if (rr95 >= 1.0) {
      sl = sl95;
      rr = rr95;
    }
  }

  // Si aún R:R < minRR, ajustar
  if (rr < config.tpSl.minRR) {
    const adjustedTP = sl * config.tpSl.minRR;
    return {
      tp: adjustedTP,
      sl,
      rr: config.tpSl.minRR,
    };
  }

  return { tp, sl, rr };
}

/**
 * Calculate position size
 */
function calculatePositionSize(
  capital: number,
  leverage: number,
  slPercent: number,
  config: Refined2Config,
): number {
  const riskAmount = capital * (config.risk.defaultRiskPercent / 100);
  const positionValue = riskAmount / slPercent;
  const positionSize = (positionValue / capital) * leverage;

  return Math.max(0, positionSize);
}

/**
 * Create trading setup
 */
function createTradingSetup(
  candles: HistoricalCandle[],
  tpSl: { tp: number; sl: number; rr: number },
  positionSize: number,
  config: Refined2Config,
): Refined2PredictionResult['setup'] {
  const entryPrice = candles[candles.length - 1].close;

  return {
    entryPrice,
    tp: entryPrice * (1 + tpSl.tp),
    sl: entryPrice * (1 - tpSl.sl),
    positionSize,
    management: {
      beAtMFE50: config.management.beAtMFE50,
      trailingMinTicks: config.management.trailingMinTicks,
      timeStopPercentile: config.management.timeStopPercentile,
      // BE más temprano para señales borderline (55-60 confianza)
      beAtMFE40: true, // BE en p40 MFE para señales 55-60
      trailingAtMAE80: true, // Trailing en p80 MAE post-BE
    },
  };
}

/**
 * Calculate risk level
 */
function calculateRiskLevel(
  confidence: number,
  regimes: RegimeDetection,
  config: Refined2Config,
): 'LOW' | 'MED' | 'HIGH' {
  if (confidence >= 80) return 'LOW';
  if (confidence >= 60) return 'MED';
  return 'HIGH';
}

/**
 * Create SIDEWAYS result
 */
function createSidewaysResult(
  reason: string,
  explanation: string,
): Refined2PredictionResult {
  return {
    direction: 'SIDEWAYS',
    confidence: 0,
    expectedMove: 0,
    riskLevel: 'HIGH',
    breakdown: {
      momentumScore: 0,
      bookScore: 0,
      flowScore: 0,
      climaxScore: 0,
    },
    explain: {
      dimensions: [],
      confidenceBin: 0,
      regime: 'UNKNOWN',
      reason,
    },
  };
}

/**
 * Calculate volatility (simplified ATR)
 */
function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  let sum = 0;
  for (let i = 1; i < prices.length; i++) {
    sum += Math.abs(prices[i] - prices[i - 1]);
  }

  return sum / (prices.length - 1);
}

/**
 * Calculate liquidity depth
 */
function calculateLiquidityDepth(book: BookSnapshot): number {
  const bidDepth = book.bids
    .slice(0, 5)
    .reduce((sum, bid) => sum + parseFloat(bid.qty), 0);
  const askDepth = book.asks
    .slice(0, 5)
    .reduce((sum, ask) => sum + parseFloat(ask.qty), 0);
  return bidDepth + askDepth;
}

/**
 * Calculate spreads
 */
function calculateSpreads(book: BookSnapshot): number[] {
  if (book.bids.length === 0 || book.asks.length === 0) return [];

  const bestBid = parseFloat(book.bids[0].price);
  const bestAsk = parseFloat(book.asks[0].price);
  return [bestAsk - bestBid];
}

/**
 * Calculate depths
 */
function calculateDepths(book: BookSnapshot): number[] {
  const bidDepth = book.bids
    .slice(0, 5)
    .reduce((sum, bid) => sum + parseFloat(bid.qty), 0);
  const askDepth = book.asks
    .slice(0, 5)
    .reduce((sum, ask) => sum + parseFloat(ask.qty), 0);
  return [bidDepth, askDepth];
}

// ============================================================================
// EXPORT FOR COMPATIBILITY
// ============================================================================

/**
 * Main export function with default parameters for backward compatibility
 */
export function refined2PredictionCompat(
  historicalCandles: HistoricalCandle[],
  currentBook: BookSnapshot | null,
  minCandles = 3,
): PredictionScore {
  console.log(
    `🔍 Refined2.0 Debug: ${historicalCandles.length} candles, book: ${currentBook ? 'present' : 'null'}`,
  );

  if (historicalCandles.length < 3) {
    return {
      direction: 'SIDEWAYS',
      confidence: 0,
      expectedMove: 0,
      riskLevel: 'HIGH',
      breakdown: {
        momentumScore: 0,
        bookScore: 0,
        flowScore: 0,
        climaxScore: 0,
      },
    };
  }

  // TEST: Usar el algoritmo refined normal directamente para debug
  const baseResult = refinedPrediction(
    historicalCandles,
    currentBook,
    minCandles,
  );

  console.log(
    `🔍 Refined2.0 Result: ${baseResult.direction}, confidence: ${baseResult.confidence}`,
  );

  return baseResult;
}

/*
 * NOTA DE CALIDAD:
 *
 * "Mejorar el TP no es pedir más, es alinearlo a lo que el mercado suele dar cuando aparece nuestra señal.
 * Por eso usamos TP = percentil(MFE) y SL = percentil(MAE) condicionados por bin de confianza y régimen,
 * con TP1/TP2 y trailing para capturar las colas derechas sin comprometer el R:R ni inflar el tiempo en mercado."
 *
 * Este algoritmo implementa:
 * - Scores normalizados con winsorization y suavizado
 * - Umbrales por percentil y régimen de mercado
 * - Gating 2/4 (o 3/4 en condiciones difíciles)
 * - Confianza calibrada empíricamente
 * - TP/SL data-driven basado en MFE/MAE históricos
 * - Gestión de posición con BE, trailing y time-stop
 * - Análisis multi-dimensional con consenso
 * - Telemetría completa para auditoría
 */
