import { BookSnapshot } from '../types/book.types';
import {
  type HistoricalCandle,
  type PredictionScore,
  type MomentumScore,
  type BookPressure,
} from '../helpers/predictionEngine';

// Algoritmo mejorado "algoritmo2" - Optimizado para mayor profit y success rate
export function algoritmo2(
  historicalCandles: HistoricalCandle[],
  currentBook: BookSnapshot | null,
  minCandles = 3,
): PredictionScore {
  if (historicalCandles.length < minCandles) {
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

  // FASE 1: Análisis de Momentum mejorado
  const momentum = analyzeMomentumImproved(historicalCandles);

  // FASE 2: Análisis de Order Book mejorado
  const bookPressure = currentBook
    ? analyzeBookPressureImproved(currentBook, historicalCandles)
    : {
        bidAskImbalance: 0,
        spreadTightening: 0,
        depthAsymmetry: 0,
        liquidityLevel: 0,
        momentumAlignment: 0,
      };

  // FASE 3: Análisis de Volume Flow mejorado
  const flowScore = analyzeVolumeFlowImproved(historicalCandles);

  // FASE 4: Análisis de Climax mejorado
  const climaxScore = analyzeClimaxPressureImproved(historicalCandles);

  // Extraer características VWAP y libro multiminuto
  const { priceVsVwapPct, vwapSlope } = computeVwapFeatures(historicalCandles);
  const recentBook = computeRecentBookFeatures(historicalCandles, 5);

  // FASE 5: Decisión final optimizada con gating adicional
  return calculateFinalPredictionImproved(
    momentum,
    bookPressure,
    flowScore,
    climaxScore,
    {
      priceVsVwapPct,
      vwapSlope,
      recentAvgImbalance: recentBook.avgImbalance,
      recentDepthAsymmetry: recentBook.avgDepthAsymmetry,
      recentSpreadTightening: recentBook.spreadTightening,
    },
  );
}

// ============================================================================
// ANÁLISIS MEJORADO DE MOMENTUM
// ============================================================================

function analyzeMomentumImproved(candles: HistoricalCandle[]): MomentumScore {
  const recent = candles.slice(-8); // Últimos 8 minutos para mejor estadística

  // 1. Price Momentum con análisis de tendencia más robusto
  const priceMomentum = calculatePriceMomentumImproved(candles, recent);

  // 2. Volume Momentum con análisis de aceleración
  const volumeMomentum = calculateVolumeMomentumImproved(recent);

  // 3. Imbalance Trend con análisis de convergencia
  const imbalanceTrend = calculateImbalanceTrendImproved(recent);

  // 4. Volatility Trend con análisis de breakout
  const volatilityTrend = calculateVolatilityTrendImproved(recent);

  // 5. Climax Pressure con análisis de momentum
  const climaxPressure = calculateClimaxPressureImproved(recent);

  return {
    priceMomentum,
    volumeMomentum,
    imbalanceTrend,
    volatilityTrend,
    climaxPressure,
  };
}

function calculatePriceMomentumImproved(
  allCandles: HistoricalCandle[],
  recentCandles: HistoricalCandle[],
): number {
  if (recentCandles.length < 3) return 0;

  const currentPrice = recentCandles[recentCandles.length - 1].close;

  // Análisis de tendencia con múltiples timeframes
  const shortTerm = recentCandles.slice(-3);
  const mediumTerm = recentCandles.slice(-6);
  const longTerm = allCandles.slice(-20);

  // Momentum a corto plazo (últimos 3 minutos)
  const shortMomentum = calculateBasicMomentum(shortTerm);

  // Momentum a medio plazo (últimos 6 minutos)
  const mediumMomentum = calculateBasicMomentum(mediumTerm);

  // Momentum a largo plazo (últimos 20 minutos)
  const longMomentum = calculateBasicMomentum(longTerm);

  // Ponderación: 50% corto, 30% medio, 20% largo
  const weightedMomentum =
    shortMomentum * 0.5 + mediumMomentum * 0.3 + longMomentum * 0.2;

  // Análisis de soportes y resistencias
  const supportResistance = calculateSupportResistanceImproved(allCandles);

  // Factor de soporte/resistencia (más conservador)
  let srFactor = 0;
  if (
    supportResistance.support &&
    currentPrice <= supportResistance.support * 1.001
  ) {
    srFactor = 0.3; // Cerca del soporte = tendencia alcista
  } else if (
    supportResistance.resistance &&
    currentPrice >= supportResistance.resistance * 0.999
  ) {
    srFactor = -0.3; // Cerca de resistencia = tendencia bajista
  }

  // Combinar momentum con soporte/resistencia
  const combinedMomentum = weightedMomentum + srFactor;

  return Math.max(-1, Math.min(1, combinedMomentum * 80)); // Reducido de 100 a 80
}

function calculateBasicMomentum(candles: HistoricalCandle[]): number {
  if (candles.length < 2) return 0;

  const firstPrice = candles[0].open;
  const lastPrice = candles[candles.length - 1].close;

  return (lastPrice - firstPrice) / firstPrice;
}

function calculateSupportResistanceImproved(candles: HistoricalCandle[]): {
  support: number | null;
  resistance: number | null;
} {
  if (candles.length < 15) return { support: null, resistance: null };

  const recentCandles = candles.slice(-25);
  const highs = recentCandles.map((c) => c.high);
  const lows = recentCandles.map((c) => c.low);

  // Encontrar máximos y mínimos locales con ventana más amplia
  const localHighs: number[] = [];
  const localLows: number[] = [];

  for (let i = 2; i < highs.length - 2; i++) {
    if (
      highs[i] > highs[i - 1] &&
      highs[i] > highs[i - 2] &&
      highs[i] > highs[i + 1] &&
      highs[i] > highs[i + 2]
    ) {
      localHighs.push(highs[i]);
    }
    if (
      lows[i] < lows[i - 1] &&
      lows[i] < lows[i - 2] &&
      lows[i] < lows[i + 1] &&
      lows[i] < lows[i + 2]
    ) {
      localLows.push(lows[i]);
    }
  }

  const resistance =
    localHighs.length > 0
      ? localHighs.reduce((a, b) => a + b, 0) / localHighs.length
      : null;
  const support =
    localLows.length > 0
      ? localLows.reduce((a, b) => a + b, 0) / localLows.length
      : null;

  return { support, resistance };
}

function calculateVolumeMomentumImproved(candles: HistoricalCandle[]): number {
  if (candles.length < 4) return 0;

  const volumes = candles.map((c) => c.tickVol || 0).filter((v) => v > 0);
  if (volumes.length < 3) return 0;

  // Análisis de aceleración de volumen más sofisticado
  const early = volumes.slice(0, Math.floor(volumes.length * 0.4));
  const middle = volumes.slice(
    Math.floor(volumes.length * 0.3),
    Math.floor(volumes.length * 0.7),
  );
  const late = volumes.slice(-Math.floor(volumes.length * 0.4));

  const avgEarly = early.reduce((a, b) => a + b, 0) / early.length;
  const avgMiddle = middle.reduce((a, b) => a + b, 0) / middle.length;
  const avgLate = late.reduce((a, b) => a + b, 0) / late.length;

  if (avgEarly === 0) return 0;

  // Calcular aceleración: late vs early, con factor de middle
  const acceleration = (avgLate - avgEarly) / avgEarly;
  const middleFactor = (avgMiddle - avgEarly) / avgEarly;

  // Combinar aceleración con factor medio
  const combinedAcceleration = acceleration * 0.7 + middleFactor * 0.3;

  return Math.max(-1, Math.min(1, combinedAcceleration * 1.2));
}

function calculateImbalanceTrendImproved(candles: HistoricalCandle[]): number {
  const imbalances = candles
    .map((c) => c.imbalance || 0)
    .filter((i) => i !== 0);

  if (imbalances.length < 3) return 0;

  // Análisis de tendencia con regresión ponderada
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < imbalances.length; i++) {
    const weight = (i + 1) * (i + 1); // Peso cuadrático
    weightedSum += imbalances[i] * weight;
    totalWeight += weight;
  }

  const avgImbalance =
    imbalances.reduce((a, b) => a + b, 0) / imbalances.length;
  const trend = weightedSum / totalWeight - avgImbalance;

  return Math.max(-1, Math.min(1, trend * 1.5));
}

function calculateVolatilityTrendImproved(candles: HistoricalCandle[]): number {
  if (candles.length < 6) return 0;

  const volatilities = candles.map((c) => Math.abs(c.fluct || 0));

  // Análisis de volatilidad con ventanas superpuestas
  const early = volatilities.slice(0, Math.floor(volatilities.length * 0.5));
  const late = volatilities.slice(-Math.floor(volatilities.length * 0.5));

  const avgEarly = early.reduce((a, b) => a + b, 0) / early.length;
  const avgLate = late.reduce((a, b) => a + b, 0) / late.length;

  if (avgEarly === 0) return 0;

  const trend = (avgLate - avgEarly) / avgEarly;
  return Math.max(-1, Math.min(1, trend * 2)); // Aumentado de 1.5 a 2
}

function calculateClimaxPressureImproved(candles: HistoricalCandle[]): number {
  const recent = candles.slice(-6);
  let climaxScore = 0;
  let validCandles = 0;

  for (const candle of recent) {
    if (candle.flags) {
      let candleScore = 0;
      if (candle.flags.climax) candleScore += 0.6; // Aumentado de 0.5
      if (candle.flags.bullish) candleScore += 0.4; // Aumentado de 0.3
      if (candle.flags.bearish) candleScore -= 0.4; // Aumentado de 0.3

      climaxScore += candleScore;
      validCandles++;
    }
  }

  if (validCandles === 0) return 0;
  return Math.max(-1, Math.min(1, (climaxScore / validCandles) * 1.3)); // Factor de amplificación
}

// ============================================================================
// ANÁLISIS MEJORADO DE ORDER BOOK
// ============================================================================

function analyzeBookPressureImproved(
  currentBook: BookSnapshot,
  historicalCandles: HistoricalCandle[],
): BookPressure {
  const bidAskImbalance = calculateBidAskImbalanceImproved(currentBook);
  const spreadTightening = calculateSpreadTighteningImproved(
    currentBook,
    historicalCandles,
  );
  const depthAsymmetry = calculateDepthAsymmetryImproved(currentBook);
  const liquidityLevel = calculateLiquidityLevelImproved(currentBook);
  const momentumAlignment = calculateMomentumAlignmentImproved(
    currentBook,
    historicalCandles,
  );

  return {
    bidAskImbalance,
    spreadTightening,
    depthAsymmetry,
    liquidityLevel,
    momentumAlignment,
  };
}

function calculateBidAskImbalanceImproved(book: BookSnapshot): number {
  if (!book.totalBidQty || !book.totalAskQty) return 0;

  const total = book.totalBidQty + book.totalAskQty;
  if (total === 0) return 0;

  const imbalance = (book.totalBidQty - book.totalAskQty) / total;

  // Aplicar función de saturación para evitar valores extremos
  return Math.max(-0.8, Math.min(0.8, imbalance * 1.2));
}

function calculateSpreadTighteningImproved(
  book: BookSnapshot,
  candles: HistoricalCandle[],
): number {
  if (!book.spreadPct) return 0;

  const historicalSpreads = candles
    .map((c) => c.book?.spreadPct)
    .filter((s) => s !== undefined) as number[];

  if (historicalSpreads.length === 0) return 0;

  const avgHistoricalSpread =
    historicalSpreads.reduce((a, b) => a + b, 0) / historicalSpreads.length;
  if (avgHistoricalSpread === 0) return 0;

  const tightening =
    (avgHistoricalSpread - book.spreadPct) / avgHistoricalSpread;
  return Math.max(0, Math.min(1, tightening * 1.5)); // Aumentado de 1 a 1.5
}

function calculateDepthAsymmetryImproved(book: BookSnapshot): number {
  if (!book.bids || !book.asks) return 0;

  // Análisis de profundidad en más niveles
  const bidDepth = book.bids
    .slice(0, 8) // Aumentado de 5 a 8
    .reduce((sum, level) => sum + parseFloat(level.qty), 0);
  const askDepth = book.asks
    .slice(0, 8) // Aumentado de 5 a 8
    .reduce((sum, level) => sum + parseFloat(level.qty), 0);

  const total = bidDepth + askDepth;
  if (total === 0) return 0;

  return Math.max(-0.8, Math.min(0.8, ((bidDepth - askDepth) / total) * 1.3));
}

function calculateLiquidityLevelImproved(book: BookSnapshot): number {
  if (!book.totalBidQty || !book.totalAskQty) return 0;

  const totalLiquidity = book.totalBidQty + book.totalAskQty;

  // Escala de liquidez ajustada para ETHUSDT
  if (totalLiquidity >= 150) return 1; // Aumentado de 100
  if (totalLiquidity >= 50) return 0.7; // Aumentado de 10
  if (totalLiquidity >= 20) return 0.4; // Nuevo nivel
  return 0.1;
}

function calculateMomentumAlignmentImproved(
  book: BookSnapshot,
  candles: HistoricalCandle[],
): number {
  if (candles.length === 0) return 0;

  // Análisis de alineación más sofisticado
  const lastMinuteImbalance = candles[candles.length - 1]?.imbalance || 0;
  const bookImbalance = book.imbalance || 0;

  // Promedio ponderado de últimos 5 minutos
  const recentImbalances = candles.slice(-5).map((c) => c.imbalance || 0);
  const weights = [0.4, 0.3, 0.2, 0.1, 0.0]; // Peso decreciente
  const weightedAvg = recentImbalances.reduce(
    (sum, imb, i) => sum + imb * weights[i],
    0,
  );

  // Combinar último minuto (60%) con promedio ponderado (40%)
  const combinedImbalance = lastMinuteImbalance * 0.6 + weightedAvg * 0.4;

  // Análisis de alineación más granular
  if (Math.abs(combinedImbalance) < 0.03 && Math.abs(bookImbalance) < 0.03) {
    return 0.2; // Ambos neutrales
  }

  if (combinedImbalance > 0.05 && bookImbalance > 0.05) return 1; // Ambos alcistas
  if (combinedImbalance < -0.05 && bookImbalance < -0.05) return 1; // Ambos bajistas

  if (combinedImbalance > 0.05 && bookImbalance < -0.05) return -0.8; // Desalineación total
  if (combinedImbalance < -0.05 && bookImbalance > 0.05) return -0.8; // Desalineación total

  return 0.6; // Alineación parcial
}

// ============================================================================
// ANÁLISIS MEJORADO DE VOLUME FLOW
// ============================================================================

function analyzeVolumeFlowImproved(candles: HistoricalCandle[]): number {
  if (candles.length < 3) return 0;

  const recent = candles.slice(-5); // Aumentado de 3 a 5

  let flowStrength = 0;
  let validCandles = 0;

  for (const candle of recent) {
    if (candle.buyVol && candle.sellVol) {
      const totalVol = candle.buyVol + candle.sellVol;
      if (totalVol > 0) {
        const imbalance = (candle.buyVol - candle.sellVol) / totalVol;
        flowStrength += imbalance;
        validCandles++;
      }
    }
  }

  if (validCandles === 0) return 0;

  const avgFlow = flowStrength / validCandles;
  return Math.max(-1, Math.min(1, avgFlow * 1.4)); // Aumentado de 1 a 1.4
}

// ============================================================================
// ANÁLISIS MEJORADO DE CLIMAX
// ============================================================================

function analyzeClimaxPressureImproved(candles: HistoricalCandle[]): number {
  const recent = candles.slice(-6); // Aumentado de 5 a 6

  let climaxScore = 0;
  let validCandles = 0;

  for (const candle of recent) {
    if (candle.flags) {
      let candleScore = 0;
      if (candle.flags.climax) candleScore += 0.7; // Aumentado de 0.5
      if (candle.flags.bullish) candleScore += 0.4; // Aumentado de 0.3
      if (candle.flags.bearish) candleScore -= 0.4; // Aumentado de 0.3

      climaxScore += candleScore;
      validCandles++;
    }
  }

  if (validCandles === 0) return 0;

  return Math.max(-1, Math.min(1, (climaxScore / validCandles) * 1.4)); // Aumentado de 1 a 1.4
}

// ============================================================================
// CÁLCULO FINAL MEJORADO
// ============================================================================

function calculateFinalPredictionImproved(
  momentum: MomentumScore,
  bookPressure: BookPressure,
  flowScore: number,
  climaxScore: number,
  extras?: {
    priceVsVwapPct: number;
    vwapSlope: number;
    recentAvgImbalance: number;
    recentDepthAsymmetry: number;
    recentSpreadTightening: number;
  },
): PredictionScore {
  // Ponderación optimizada para mayor precisión
  const weights = {
    momentum: 0.5, // Aumentado de 0.45 - Momentum histórico
    book: 0.25, // Reducido de 0.3 - Order book
    flow: 0.2, // Mantenido - Volume flow
    climax: 0.05, // Mantenido - Presión de climax
  };

  // Calcular score de momentum mejorado
  const momentumScore =
    momentum.priceMomentum * 0.6 + // Aumentado de 0.5
    momentum.volumeMomentum * 0.25 + // Reducido de 0.3
    momentum.imbalanceTrend * 0.15; // Reducido de 0.2

  // Calcular score de book mejorado
  const bookScore =
    bookPressure.bidAskImbalance * 0.5 + // Aumentado de 0.4
    bookPressure.depthAsymmetry * 0.3 + // Mantenido
    bookPressure.momentumAlignment * 0.2; // Reducido de 0.3

  // Score final ponderado
  const finalScore =
    momentumScore * weights.momentum +
    bookScore * weights.book +
    flowScore * weights.flow +
    climaxScore * weights.climax;

  // Estrategia mejorada: filtros anti-SIDEWAYS y acuerdo Momentum+Book
  let direction: 'UP' | 'DOWN' | 'SIDEWAYS';

  // Condiciones más balanceadas
  const goodMomentum = Math.abs(momentumScore) > 0.25; // Reducido de 0.4
  const goodBook = Math.abs(bookScore) > 0.25; // más estricto para evitar libro ambiguo
  const goodFlow = Math.abs(flowScore) > 0.15; // Reducido de 0.25
  const goodClimax = Math.abs(climaxScore) > 0.1; // Nuevo

  // Requerir al menos 2 señales buenas
  const signalCount = [goodMomentum, goodBook, goodFlow, goodClimax].filter(
    Boolean,
  ).length;
  const isGoodSignal = signalCount >= 2;

  // Guardas SIDEWAYS: baja volatilidad, libro neutral y flujo débil
  const lowVolatility = Math.abs(momentum.volatilityTrend) < 0.1;
  const neutralBook =
    Math.abs(bookPressure.bidAskImbalance) < 0.05 &&
    Math.abs(bookPressure.depthAsymmetry) < 0.05 &&
    Math.abs(bookPressure.momentumAlignment) < 0.2;
  const weakFlow = Math.abs(flowScore) < 0.12;

  const prelimExpectedMove = Math.abs(finalScore) * 1.5;
  const isLikelySideways =
    Math.abs(finalScore) < 0.2 ||
    prelimExpectedMove < 0.18 ||
    (lowVolatility && neutralBook && weakFlow);

  // Exigir acuerdo Momentum + Book salvo flujo muy fuerte
  const momentumSign = Math.sign(momentum.priceMomentum);
  const bookSign = Math.sign(
    bookPressure.bidAskImbalance + bookPressure.momentumAlignment,
  );
  const flowVeryStrong = Math.abs(flowScore) > 0.45;
  const directionAligned =
    momentumSign !== 0 &&
    bookSign !== 0 &&
    Math.sign(momentumSign) === Math.sign(bookSign);

  // Gating adicional por VWAP y libro multiminuto
  const priceVwapOk = extras
    ? Math.abs(extras.priceVsVwapPct) >= 0.001 || Math.abs(flowScore) >= 0.12
    : true;
  const vwapSlopeOk = extras
    ? Math.abs(extras.vwapSlope) >= 0.0005 || Math.abs(flowScore) >= 0.45
    : true;
  const recentBookStrong = extras
    ? (Math.abs(extras.recentAvgImbalance) >= 0.1 &&
        Math.abs(extras.recentDepthAsymmetry) >= 0.08) ||
      extras.recentSpreadTightening > 0.2
    : true;

  if (
    isLikelySideways ||
    !isGoodSignal ||
    (!directionAligned && !flowVeryStrong) ||
    !priceVwapOk ||
    !vwapSlopeOk ||
    !recentBookStrong
  ) {
    direction = 'SIDEWAYS';
  } else if (finalScore > 0.25) {
    direction = 'UP';
  } else if (finalScore < -0.25) {
    direction = 'DOWN';
  } else {
    direction = 'SIDEWAYS';
  }

  // Calcular confianza más conservadora
  const confidence = Math.min(90, Math.abs(finalScore) * 120); // Aumentado de 100 a 120

  // Calcular movimiento esperado más realista
  const expectedMove = Math.abs(finalScore) * 1.5; // Reducido de 2 a 1.5

  // Determinar nivel de riesgo más estricto
  let riskLevel: 'LOW' | 'MED' | 'HIGH';
  if (confidence > 75 && bookPressure.liquidityLevel > 0.6)
    riskLevel = 'LOW'; // Más estricto
  else if (confidence > 60 && bookPressure.liquidityLevel > 0.4)
    riskLevel = 'MED'; // Más estricto
  else riskLevel = 'HIGH';

  return {
    direction,
    confidence,
    expectedMove,
    riskLevel,
    breakdown: {
      momentumScore: momentumScore * 100,
      bookScore: bookScore * 100,
      flowScore: flowScore * 100,
      climaxScore: climaxScore * 100,
    },
  };
}

export type { HistoricalCandle, PredictionScore };

// ============================================================================
// FEATURES: VWAP y libro multiminuto
// ==========================================================================

function computeVwapFeatures(candles: HistoricalCandle[]): {
  priceVsVwapPct: number;
  vwapSlope: number;
} {
  const recent = candles.slice(-5);
  const last = candles[candles.length - 1];
  const lastVwap = last?.vwap ?? last?.close;
  const priceVsVwapPct = lastVwap ? (last.close - lastVwap) / lastVwap : 0;

  const vwapPoints = recent
    .map((c) => c.vwap ?? c.close)
    .filter((v) => typeof v === 'number');
  let vwapSlope = 0;
  if (vwapPoints.length >= 3) {
    const a = vwapPoints[vwapPoints.length - 3];
    const b = vwapPoints[vwapPoints.length - 1];
    vwapSlope = (b - a) / a;
  }
  return { priceVsVwapPct, vwapSlope };
}

function computeRecentBookFeatures(
  candles: HistoricalCandle[],
  windowSize = 5,
): {
  avgImbalance: number;
  avgDepthAsymmetry: number;
  spreadTightening: number;
} {
  const recent = candles.slice(-windowSize);
  const imbs: number[] = [];
  const depths: number[] = [];
  const spreads: number[] = [];
  for (const c of recent) {
    const book = c.book as any;
    if (book) {
      if (typeof book.imbalance === 'number') imbs.push(book.imbalance);
      if (book.bids && book.asks) {
        const bidDepth = book.bids
          .slice(0, 5)
          .reduce((s: number, lv: any) => s + parseFloat(lv.qty), 0);
        const askDepth = book.asks
          .slice(0, 5)
          .reduce((s: number, lv: any) => s + parseFloat(lv.qty), 0);
        const total = bidDepth + askDepth;
        if (total > 0) depths.push((bidDepth - askDepth) / total);
      }
      if (typeof book.spreadPct === 'number') spreads.push(book.spreadPct);
    }
  }
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avgSpread = avg(spreads);
  const lastSpread = spreads.length ? spreads[spreads.length - 1] : 0;
  const spreadTightening =
    avgSpread > 0
      ? Math.max(0, Math.min(1, (avgSpread - lastSpread) / avgSpread))
      : 0;

  return {
    avgImbalance: avg(imbs),
    avgDepthAsymmetry: avg(depths),
    spreadTightening,
  };
}
