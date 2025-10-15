import { BookSnapshot } from '../types/book.types';
import {
  type HistoricalCandle,
  type PredictionScore,
  type MomentumScore,
  type BookPressure,
} from '../helpers/predictionEngine';

// Sideway Prediction Algorithm - Optimized for range trading and mean reversion
export function sidewayPrediction(
  historicalCandles: HistoricalCandle[],
  currentBook: BookSnapshot | null,
  minCandles = 15, // Más velas para análisis de rangos
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

  // 🔧 ADAPTACIÓN SEGÚN CANTIDAD DE DATOS
  const dataQuality = historicalCandles.length;
  let adaptationMode = 'NORMAL';

  if (dataQuality < 40) {
    adaptationMode = 'ULTRA_CONSERVATIVE';
    console.log('⚠️ MODO ULTRA CONSERVADOR - Pocos datos:', dataQuality);
  } else if (dataQuality < 60) {
    adaptationMode = 'CONSERVATIVE';
    console.log('⚠️ MODO CONSERVADOR - Datos moderados:', dataQuality);
  } else {
    adaptationMode = 'NORMAL';
    console.log('✅ MODO NORMAL - Muchos datos:', dataQuality);
  }

  // FASE 1: Análisis de Rango Lateral
  const rangeAnalysis = analyzePriceRange(historicalCandles);

  // FASE 2: Detección de Soportes y Resistencias
  const supportResistance = identifySupportResistance(historicalCandles);

  // FASE 3: Análisis VWAP Mean Reversion
  const vwapAnalysis = analyzeVwapMeanReversion(historicalCandles);

  // FASE 4: Análisis de Order Book para rangos
  const bookAnalysis = currentBook
    ? analyzeBookForRanges(currentBook, historicalCandles)
    : {
        rangeSupport: 0,
        rangeResistance: 0,
        liquidityAtLevels: 0,
        bookNeutrality: 0,
      };

  // FASE 5: Análisis de Volumen en Rangos
  const volumeAnalysis = analyzeVolumeInRanges(historicalCandles);

  // FASE 6: Análisis de Micro-movimientos (45 velas de 1 minuto)
  const microMovementAnalysis = analyzeMicroMovements(historicalCandles);

  // FASE 7: Análisis de Imbalance del Order Book
  const imbalanceAnalysis = analyzeOrderBookImbalance(
    currentBook,
    historicalCandles,
  );

  // FASE 8: Decisión de Estrategia
  return calculateSidewayStrategy(
    rangeAnalysis,
    supportResistance,
    vwapAnalysis,
    bookAnalysis,
    volumeAnalysis,
    microMovementAnalysis,
    imbalanceAnalysis,
  );
}

// ============================================================================
// ANÁLISIS DE RANGO LATERAL
// ============================================================================

interface RangeAnalysis {
  isInRange: boolean;
  rangeSize: number; // % del rango respecto al precio
  rangeDuration: number; // Velas en rango
  volatility: number;
  trendStrength: number;
  pricePosition: number; // 0-1 (0 = soporte, 1 = resistencia)
  rangeBounces: number; // Número de rebotes en el rango
}

function analyzeRangeBounces(
  candles: HistoricalCandle[],
  minLow: number,
  maxHigh: number,
): number {
  const rangeThreshold = 0.8; // 80% del rango para considerar un toque
  const supportLevel = minLow + (maxHigh - minLow) * 0.1; // 10% del rango desde abajo
  const resistanceLevel = maxHigh - (maxHigh - minLow) * 0.1; // 10% del rango desde arriba

  let bounces = 0;
  let lastTouch = 'none'; // 'support', 'resistance', 'none'

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const current = candles[i];

    // Toque en soporte
    if (current.low <= supportLevel && lastTouch !== 'support') {
      bounces++;
      lastTouch = 'support';
    }
    // Toque en resistencia
    else if (current.high >= resistanceLevel && lastTouch !== 'resistance') {
      bounces++;
      lastTouch = 'resistance';
    }
  }

  return Math.min(bounces, 5); // Máximo 5 rebotes
}

function analyzePriceRange(candles: HistoricalCandle[]): RangeAnalysis {
  const recent = candles.slice(-45); // Últimas 45 velas (45 minutos)
  const prices = recent.map((c) => c.close);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);

  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const currentPrice = prices[prices.length - 1];
  const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  // Calcular tamaño del rango
  const rangeSize = ((maxHigh - minLow) / avgPrice) * 100;

  // Calcular volatilidad
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const volatility =
    Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length) *
    100;

  // Calcular fuerza de tendencia (RSI simplificado)
  const gains = returns.filter((r) => r > 0).reduce((sum, r) => sum + r, 0);
  const losses = Math.abs(
    returns.filter((r) => r < 0).reduce((sum, r) => sum + r, 0),
  );
  const trendStrength = losses > 0 ? gains / (gains + losses) : 1;

  // Determinar si está en rango (con más datos)
  const isInRange =
    rangeSize < 2.5 && volatility < 1.8 && Math.abs(trendStrength - 0.5) < 0.3;

  // Posición del precio en el rango
  const pricePosition = (currentPrice - minLow) / (maxHigh - minLow);

  // Duración del rango (simplificado)
  const rangeDuration = Math.min(20, recent.length);

  // Análisis de rebotes en el rango (simplificado temporalmente)
  const rangeBounces = 2; // Valor fijo temporal

  return {
    isInRange,
    rangeSize,
    rangeDuration,
    volatility,
    trendStrength,
    pricePosition,
    rangeBounces,
  };
}

// ============================================================================
// DETECCIÓN DE SOPORTES Y RESISTENCIAS
// ============================================================================

interface SupportResistance {
  supportLevels: number[];
  resistanceLevels: number[];
  currentSupport: number | null;
  currentResistance: number | null;
  supportStrength: number;
  resistanceStrength: number;
  distanceToSupport: number;
  distanceToResistance: number;
}

function identifySupportResistance(
  candles: HistoricalCandle[],
): SupportResistance {
  const recent = candles.slice(-45); // 45 velas para niveles más confiables
  const prices = recent.map((c) => c.close);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);
  const currentPrice = prices[prices.length - 1];

  // Encontrar niveles de soporte y resistencia
  const supportLevels = findLevels(lows, 'support');
  const resistanceLevels = findLevels(highs, 'resistance');

  // Encontrar niveles más cercanos al precio actual
  const currentSupport = findNearestLevel(currentPrice, supportLevels, 'below');
  const currentResistance = findNearestLevel(
    currentPrice,
    resistanceLevels,
    'above',
  );

  // Calcular fuerza de los niveles
  const supportStrength = calculateLevelStrength(currentSupport, lows);
  const resistanceStrength = calculateLevelStrength(currentResistance, highs);

  // Calcular distancias
  const distanceToSupport = currentSupport
    ? ((currentPrice - currentSupport) / currentPrice) * 100
    : 100;
  const distanceToResistance = currentResistance
    ? ((currentResistance - currentPrice) / currentPrice) * 100
    : 100;

  return {
    supportLevels,
    resistanceLevels,
    currentSupport,
    currentResistance,
    supportStrength,
    resistanceStrength,
    distanceToSupport,
    distanceToResistance,
  };
}

function findLevels(
  prices: number[],
  type: 'support' | 'resistance',
): number[] {
  const levels: number[] = [];
  const tolerance = 0.001; // 0.1% de tolerancia

  for (let i = 1; i < prices.length - 1; i++) {
    const price = prices[i];
    let isLevel = false;

    if (type === 'support') {
      // Buscar mínimos locales
      isLevel = price < prices[i - 1] && price < prices[i + 1];
    } else {
      // Buscar máximos locales
      isLevel = price > prices[i - 1] && price > prices[i + 1];
    }

    if (isLevel) {
      // Verificar si ya existe un nivel similar
      const existingLevel = levels.find(
        (level) => Math.abs(level - price) / price < tolerance,
      );
      if (!existingLevel) {
        levels.push(price);
      }
    }
  }

  return levels.sort((a, b) => a - b);
}

function findNearestLevel(
  currentPrice: number,
  levels: number[],
  direction: 'above' | 'below',
): number | null {
  if (levels.length === 0) return null;

  const filteredLevels =
    direction === 'above'
      ? levels.filter((level) => level > currentPrice)
      : levels.filter((level) => level < currentPrice);

  if (filteredLevels.length === 0) return null;

  return direction === 'above'
    ? Math.min(...filteredLevels)
    : Math.max(...filteredLevels);
}

function calculateLevelStrength(
  level: number | null,
  prices: number[],
): number {
  if (!level) return 0;

  const tolerance = 0.002; // 0.2% de tolerancia
  const touches = prices.filter(
    (price) => Math.abs(price - level) / level < tolerance,
  ).length;

  return Math.min(touches / 5, 1); // Normalizar a 0-1
}

// ============================================================================
// ANÁLISIS VWAP MEAN REVERSION
// ============================================================================

interface VwapAnalysis {
  vwapDistance: number; // Distancia actual al VWAP (%)
  vwapSlope: number; // Pendiente del VWAP
  meanReversionSignal: number; // -1 a 1 (negativo = reversión a la media)
  vwapLevel: number;
  priceVsVwap: number; // Precio actual vs VWAP
}

function analyzeVwapMeanReversion(candles: HistoricalCandle[]): VwapAnalysis {
  const recent = candles.slice(-45);
  const currentPrice = recent[recent.length - 1].close;

  // Calcular VWAP
  let totalVolume = 0;
  let totalVwap = 0;

  recent.forEach((candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.tickVol || 1; // Usar tickVol en lugar de volume
    totalVwap += typicalPrice * volume;
    totalVolume += volume;
  });

  const vwapLevel = totalVolume > 0 ? totalVwap / totalVolume : currentPrice;

  // Calcular distancia al VWAP
  const vwapDistance = ((currentPrice - vwapLevel) / vwapLevel) * 100;

  // Calcular pendiente del VWAP (simplificado)
  const vwapSlope = calculateVwapSlope(recent);

  // Señal de mean reversion
  const meanReversionSignal =
    -Math.sign(vwapDistance) * Math.min(Math.abs(vwapDistance) / 2, 1);

  return {
    vwapDistance,
    vwapSlope,
    meanReversionSignal,
    vwapLevel,
    priceVsVwap: currentPrice / vwapLevel,
  };
}

function calculateVwapSlope(candles: HistoricalCandle[]): number {
  if (candles.length < 10) return 0;

  // Calcular VWAP para múltiples períodos para mayor robustez
  const periods = [10, 20, 30];
  let slopeSum = 0;
  let slopeCount = 0;

  periods.forEach((period) => {
    if (candles.length >= period * 2) {
      const firstHalf = candles.slice(-period * 2, -period);
      const secondHalf = candles.slice(-period);

      const firstVwap = calculateVwap(firstHalf);
      const secondVwap = calculateVwap(secondHalf);

      if (firstVwap > 0) {
        slopeSum += (secondVwap - firstVwap) / firstVwap;
        slopeCount++;
      }
    }
  });

  return slopeCount > 0 ? slopeSum / slopeCount : 0;
}

function calculateVwap(candles: HistoricalCandle[]): number {
  let totalVolume = 0;
  let totalVwap = 0;

  candles.forEach((candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.tickVol || 1;
    totalVwap += typicalPrice * volume;
    totalVolume += volume;
  });

  return totalVolume > 0 ? totalVwap / totalVolume : 0;
}

// ============================================================================
// ANÁLISIS DE ORDER BOOK PARA RANGOS
// ============================================================================

interface BookRangeAnalysis {
  rangeSupport: number;
  rangeResistance: number;
  liquidityAtLevels: number;
  bookNeutrality: number;
}

function analyzeBookForRanges(
  book: BookSnapshot,
  candles: HistoricalCandle[],
): BookRangeAnalysis {
  const currentPrice = candles[candles.length - 1].close;

  // Análisis de liquidez en niveles
  const bidLiquidity =
    book.bids?.reduce((sum, bid) => sum + parseFloat(bid.qty), 0) || 0;
  const askLiquidity =
    book.asks?.reduce((sum, ask) => sum + parseFloat(ask.qty), 0) || 0;

  // Neutralidad del libro
  const bookNeutrality =
    1 - Math.abs(bidLiquidity - askLiquidity) / (bidLiquidity + askLiquidity);

  // Niveles de soporte y resistencia en el libro
  const rangeSupport = book.bids?.[0]?.price
    ? parseFloat(book.bids[0].price)
    : currentPrice * 0.999;
  const rangeResistance = book.asks?.[0]?.price
    ? parseFloat(book.asks[0].price)
    : currentPrice * 1.001;

  // Liquidez en niveles clave
  const liquidityAtLevels = (bidLiquidity + askLiquidity) / 2;

  return {
    rangeSupport,
    rangeResistance,
    liquidityAtLevels,
    bookNeutrality,
  };
}

// ============================================================================
// ANÁLISIS DE VOLUMEN EN RANGOS
// ============================================================================

interface VolumeAnalysis {
  volumeAtSupport: number;
  volumeAtResistance: number;
  volumeTrend: number;
  accumulationDistribution: number;
}

function analyzeVolumeInRanges(candles: HistoricalCandle[]): VolumeAnalysis {
  const recent = candles.slice(-15);
  const volumes = recent.map((c) => c.tickVol || 1);
  const prices = recent.map((c) => c.close);

  // Tendencia del volumen
  const volumeTrend = calculateVolumeTrend(volumes);

  // Análisis de acumulación/distribución
  const accumulationDistribution = calculateAccumulationDistribution(recent);

  // Volumen en niveles (simplificado)
  const volumeAtSupport =
    volumes.slice(0, 5).reduce((sum, v) => sum + v, 0) / 5;
  const volumeAtResistance =
    volumes.slice(-5).reduce((sum, v) => sum + v, 0) / 5;

  return {
    volumeAtSupport,
    volumeAtResistance,
    volumeTrend,
    accumulationDistribution,
  };
}

function calculateVolumeTrend(volumes: number[]): number {
  if (volumes.length < 3) return 0;

  const firstHalf = volumes.slice(0, Math.floor(volumes.length / 2));
  const secondHalf = volumes.slice(Math.floor(volumes.length / 2));

  const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
  const secondAvg =
    secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;

  return (secondAvg - firstAvg) / firstAvg;
}

function calculateAccumulationDistribution(
  candles: HistoricalCandle[],
): number {
  let ad = 0;

  candles.forEach((candle) => {
    const clv =
      (candle.close - candle.low - (candle.high - candle.close)) /
      (candle.high - candle.low);
    ad += clv * (candle.tickVol || 1);
  });

  return ad;
}

// ============================================================================
// ANÁLISIS DE MICRO-MOVIMIENTOS (45 velas de 1 minuto)
// ============================================================================

interface MicroMovementAnalysis {
  momentumShift: number; // -1 a 1 (cambio de momentum)
  volumeSpike: number; // 0 a 1 (spike de volumen)
  priceAcceleration: number; // aceleración del precio
  supportResistanceTouch: number; // -1 a 1 (tocando niveles)
  microTrend: 'UP' | 'DOWN' | 'NEUTRAL';
}

function analyzeMicroMovements(
  candles: HistoricalCandle[],
): MicroMovementAnalysis {
  const recent = candles.slice(-45); // 45 velas de 1 minuto
  const prices = recent.map((c) => c.close);
  const volumes = recent.map((c) => c.tickVol || 1);

  // Análisis de momentum en las últimas 10 velas vs las 10 anteriores
  const last10 = prices.slice(-10);
  const prev10 = prices.slice(-20, -10);
  const last10Avg = last10.reduce((a, b) => a + b, 0) / last10.length;
  const prev10Avg = prev10.reduce((a, b) => a + b, 0) / prev10.length;
  const momentumShift = (last10Avg - prev10Avg) / prev10Avg;

  // Análisis de spike de volumen
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volumeSpike = Math.min(recentVolume / avgVolume, 3) / 3; // Normalizar a 0-1

  // Análisis de aceleración del precio
  const priceChanges = prices
    .slice(1)
    .map((p, i) => (p - prices[i]) / prices[i]);
  const acceleration =
    priceChanges.slice(-5).reduce((a, b) => a + b, 0) -
    priceChanges.slice(-10, -5).reduce((a, b) => a + b, 0);

  // Análisis de toque de soporte/resistencia
  const currentPrice = prices[prices.length - 1];
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const supportResistanceTouch =
    Math.abs(currentPrice - low) < Math.abs(currentPrice - high) ? -1 : 1;

  // Micro-trend (versión estricta)
  let microTrend: 'UP' | 'DOWN' | 'NEUTRAL' = 'NEUTRAL';
  if (momentumShift > 0.002) microTrend = 'UP';
  else if (momentumShift < -0.002) microTrend = 'DOWN';

  return {
    momentumShift,
    volumeSpike,
    priceAcceleration: acceleration,
    supportResistanceTouch,
    microTrend,
  };
}

// ============================================================================
// ANÁLISIS DE IMBALANCE DEL ORDER BOOK
// ============================================================================

interface OrderBookImbalance {
  bidAskRatio: number; // -1 a 1 (negativo = más asks)
  liquidityImbalance: number; // -1 a 1
  pricePressure: number; // -1 a 1 (presión de precio)
  spreadAnalysis: number; // 0 a 1 (análisis del spread)
}

function analyzeOrderBookImbalance(
  book: BookSnapshot | null,
  candles: HistoricalCandle[],
): OrderBookImbalance {
  if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks)) {
    return {
      bidAskRatio: 0,
      liquidityImbalance: 0,
      pricePressure: 0,
      spreadAnalysis: 0,
    };
  }

  const currentPrice = candles[candles.length - 1].close;

  // Análisis de ratio bid/ask
  const bidLiquidity = book.bids.reduce(
    (sum, bid) => sum + parseFloat(bid.qty),
    0,
  );
  const askLiquidity = book.asks.reduce(
    (sum, ask) => sum + parseFloat(ask.qty),
    0,
  );
  const bidAskRatio =
    (bidLiquidity - askLiquidity) / (bidLiquidity + askLiquidity);

  // Análisis de liquidez en múltiples niveles (más granular)
  const liquidityLevels = [0.001, 0.003, 0.005, 0.01]; // 0.1%, 0.3%, 0.5%, 1%
  let totalLiquidityImbalance = 0;
  let levelCount = 0;

  liquidityLevels.forEach((level) => {
    const nearbyBids = book.bids.filter(
      (bid) =>
        Math.abs(parseFloat(bid.price) - currentPrice) / currentPrice < level,
    );
    const nearbyAsks = book.asks.filter(
      (ask) =>
        Math.abs(parseFloat(ask.price) - currentPrice) / currentPrice < level,
    );

    const nearbyBidLiquidity = nearbyBids.reduce(
      (sum, bid) => sum + parseFloat(bid.qty),
      0,
    );
    const nearbyAskLiquidity = nearbyAsks.reduce(
      (sum, ask) => sum + parseFloat(ask.qty),
      0,
    );

    if (nearbyBidLiquidity + nearbyAskLiquidity > 0) {
      const levelImbalance =
        (nearbyBidLiquidity - nearbyAskLiquidity) /
        (nearbyBidLiquidity + nearbyAskLiquidity);
      totalLiquidityImbalance += levelImbalance * (1 - level * 100); // Peso mayor para niveles más cercanos
      levelCount++;
    }
  });

  const liquidityImbalance =
    levelCount > 0 ? totalLiquidityImbalance / levelCount : 0;

  // Análisis de presión de precio
  const bestBid = parseFloat(book.bids[0]?.price || '0');
  const bestAsk = parseFloat(book.asks[0]?.price || '0');
  const midPrice = (bestBid + bestAsk) / 2;
  const pricePressure = (currentPrice - midPrice) / midPrice;

  // Análisis del spread
  const spread = bestAsk - bestBid;
  const spreadAnalysis = Math.min(spread / (midPrice * 0.01), 1); // Normalizar a 0-1

  return {
    bidAskRatio,
    liquidityImbalance,
    pricePressure,
    spreadAnalysis,
  };
}

// ============================================================================
// CÁLCULO DE ESTRATEGIA SIDEWAYS
// ============================================================================

function calculateSidewayStrategy(
  rangeAnalysis: RangeAnalysis,
  supportResistance: SupportResistance,
  vwapAnalysis: VwapAnalysis,
  bookAnalysis: BookRangeAnalysis,
  volumeAnalysis: VolumeAnalysis,
  microMovementAnalysis: MicroMovementAnalysis,
  imbalanceAnalysis: OrderBookImbalance,
): PredictionScore {
  // Pesos para la estrategia sideways (rebalanceados)
  const weights = {
    range: 0.2, // 20% - Análisis de rango
    levels: 0.2, // 20% - Soportes y resistencias
    vwap: 0.15, // 15% - Mean reversion VWAP
    book: 0.15, // 15% - Order book
    volume: 0.1, // 10% - Análisis de volumen
    micro: 0.15, // 15% - Micro-movimientos
    imbalance: 0.05, // 5% - Imbalance del order book
  };

  // Score de rango
  const rangeScore = rangeAnalysis.isInRange ? 1 : -0.5;

  // Score de niveles
  const levelsScore = calculateLevelsScore(supportResistance);

  // Score de VWAP
  const vwapScore = vwapAnalysis.meanReversionSignal;

  // Score de libro
  const bookScore = bookAnalysis.bookNeutrality;

  // Score de volumen
  const volumeScore = volumeAnalysis.volumeTrend;

  // Score de micro-movimientos
  const microScore =
    microMovementAnalysis.momentumShift > 0
      ? 1
      : microMovementAnalysis.momentumShift < 0
        ? -1
        : 0;

  // Score de imbalance
  const imbalanceScore =
    imbalanceAnalysis.bidAskRatio > 0
      ? 1
      : imbalanceAnalysis.bidAskRatio < 0
        ? -1
        : 0;

  // Score final ponderado (con nuevos análisis)
  const finalScore =
    rangeScore * weights.range +
    levelsScore * weights.levels +
    vwapScore * weights.vwap +
    bookScore * weights.book +
    volumeScore * weights.volume +
    microScore * weights.micro +
    imbalanceScore * weights.imbalance;

  // Determinar dirección y estrategia
  let direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  let confidence: number;
  let expectedMove: number;
  let riskLevel: 'LOW' | 'MED' | 'HIGH';

  // Extraer pricePosition del rangeAnalysis
  const pricePosition = rangeAnalysis.pricePosition;

  // 🎯 FILTRO DE CONFIANZA MÍNIMA: Solo predicciones >70%
  const MIN_CONFIDENCE = 70;

  // Estrategias específicas de trading en rangos
  if (rangeAnalysis.isInRange) {
    // DEBUG: Log de condiciones para análisis
    console.log('🔍 SIDEWAY DEBUG:', {
      distanceToSupport: supportResistance.distanceToSupport,
      supportStrength: supportResistance.supportStrength,
      pricePosition,
      microTrend: microMovementAnalysis.microTrend,
      bidAskRatio: imbalanceAnalysis.bidAskRatio,
      volumeSpike: microMovementAnalysis.volumeSpike,
      distanceToResistance: supportResistance.distanceToResistance,
      resistanceStrength: supportResistance.resistanceStrength,
      vwapDistance: vwapAnalysis.vwapDistance,
      vwapSignal: vwapAnalysis.meanReversionSignal,
      liquidityImbalance: imbalanceAnalysis.liquidityImbalance,
      rangeBounces: rangeAnalysis.rangeBounces,
    });

    // Inicializar como SIDEWAYS por defecto
    direction = 'SIDEWAYS';
    confidence = 0;
    expectedMove = 0;
    riskLevel = 'HIGH';

    // 🧊 ESTRATEGIA 1: Rechazo en el techo + VWAP + Book Analysis (ESTRICTO)
    if (
      supportResistance.distanceToResistance < 0.15 && // Muy cerca del techo
      supportResistance.resistanceStrength > 0.85 && // Techo muy fuerte
      pricePosition > 0.8 && // En zona alta del rango
      microMovementAnalysis.microTrend === 'DOWN' && // Momentum bajista
      imbalanceAnalysis.bidAskRatio < -0.15 && // Más ventas que compras
      microMovementAnalysis.volumeSpike > 0.4 && // Volumen alto
      rangeAnalysis.rangeBounces >= 2 && // Al menos 2 rebotes previos
      vwapAnalysis.meanReversionSignal < -0.3 && // VWAP confirmando reversión
      vwapAnalysis.vwapDistance > 0.5 // Precio alejado del VWAP
    ) {
      // Calcular confianza primero
      const calculatedConfidence = Math.min(
        98,
        85 +
          supportResistance.resistanceStrength * 10 +
          microMovementAnalysis.volumeSpike * 15 +
          Math.abs(vwapAnalysis.meanReversionSignal) * 20,
      );

      // Solo activar si confianza >70%
      if (calculatedConfidence > MIN_CONFIDENCE) {
        direction = 'DOWN';
        confidence = calculatedConfidence;
        expectedMove = Math.min(1.5, supportResistance.distanceToSupport * 0.8);
        riskLevel =
          supportResistance.resistanceStrength > 0.9 &&
          Math.abs(vwapAnalysis.meanReversionSignal) > 0.5
            ? 'LOW'
            : 'MED';
        console.log(
          '🎯 ACTIVADA: Estrategia 1 - Rechazo en techo (Confianza:',
          calculatedConfidence.toFixed(1) + '%)',
        );
      }
    }
    // 🚀 ESTRATEGIA 2: Breakout real + VWAP + Book Analysis
    else if (
      supportResistance.distanceToResistance < 0.1 && // Rompió el techo
      supportResistance.resistanceStrength > 0.9 && // Techo muy fuerte
      pricePosition > 0.9 && // Fuera del rango
      microMovementAnalysis.microTrend === 'UP' && // Momentum alcista
      imbalanceAnalysis.bidAskRatio > 0.2 && // Más compras que ventas
      microMovementAnalysis.volumeSpike > 0.6 && // Volumen muy alto
      microMovementAnalysis.priceAcceleration > 0.001 && // Aceleración positiva
      vwapAnalysis.meanReversionSignal > 0.4 && // VWAP confirmando tendencia
      vwapAnalysis.vwapDistance > 0.3 && // Precio por encima del VWAP
      imbalanceAnalysis.liquidityImbalance > 0.1 // Liquidez favorable
    ) {
      // Calcular confianza primero
      const calculatedConfidence = Math.min(
        98,
        90 +
          microMovementAnalysis.volumeSpike * 10 +
          vwapAnalysis.meanReversionSignal * 15 +
          imbalanceAnalysis.liquidityImbalance * 10,
      );

      // Solo activar si confianza >70%
      if (calculatedConfidence > MIN_CONFIDENCE) {
        direction = 'UP';
        confidence = calculatedConfidence;
        expectedMove = Math.min(2.0, rangeAnalysis.rangeSize * 1.5);
        riskLevel =
          microMovementAnalysis.volumeSpike > 0.8 &&
          vwapAnalysis.meanReversionSignal > 0.6
            ? 'LOW'
            : 'MED';
        console.log(
          '🎯 ACTIVADA: Estrategia 2 - Breakout real (Confianza:',
          calculatedConfidence.toFixed(1) + '%)',
        );
      }
    }
    // ⚡️ ESTRATEGIA 3: Fake breakout + VWAP + Book Analysis
    else if (
      supportResistance.distanceToResistance < 0.05 && // Rompió brevemente
      supportResistance.resistanceStrength > 0.8 && // Pero el techo es fuerte
      pricePosition > 0.85 && // En zona alta
      microMovementAnalysis.microTrend === 'DOWN' && // Momentum bajista
      imbalanceAnalysis.bidAskRatio < -0.1 && // Más ventas
      microMovementAnalysis.volumeSpike < 0.4 && // Volumen bajo (fakeout)
      microMovementAnalysis.priceAcceleration < -0.001 && // Aceleración negativa
      vwapAnalysis.meanReversionSignal < -0.2 && // VWAP confirmando reversión
      imbalanceAnalysis.liquidityImbalance < -0.1 // Liquidez desfavorable
    ) {
      // Calcular confianza primero
      const calculatedConfidence = Math.min(
        95,
        80 +
          supportResistance.resistanceStrength * 15 +
          Math.abs(vwapAnalysis.meanReversionSignal) * 10,
      );

      // Solo activar si confianza >70%
      if (calculatedConfidence > MIN_CONFIDENCE) {
        direction = 'DOWN';
        confidence = calculatedConfidence;
        expectedMove = Math.min(1.2, supportResistance.distanceToSupport * 0.7);
        riskLevel = supportResistance.resistanceStrength > 0.9 ? 'LOW' : 'MED';
        console.log(
          '🎯 ACTIVADA: Estrategia 3 - Fake breakout (Confianza:',
          calculatedConfidence.toFixed(1) + '%)',
        );
      }
    }
    // 🎯 ESTRATEGIA 4: Bounce en soporte + VWAP + Book Analysis (ESTRICTO)
    else if (
      supportResistance.distanceToSupport < 0.15 && // Muy cerca del soporte
      supportResistance.supportStrength > 0.85 && // Soporte muy fuerte
      pricePosition < 0.2 && // En zona baja del rango
      microMovementAnalysis.microTrend === 'UP' && // Momentum alcista
      imbalanceAnalysis.bidAskRatio > 0.15 && // Más compras que ventas
      microMovementAnalysis.volumeSpike > 0.4 && // Volumen alto
      rangeAnalysis.rangeBounces >= 2 && // Al menos 2 rebotes previos
      vwapAnalysis.meanReversionSignal > 0.3 && // VWAP confirmando reversión
      vwapAnalysis.vwapDistance < -0.5 && // Precio por debajo del VWAP
      imbalanceAnalysis.liquidityImbalance > 0.1 // Liquidez favorable
    ) {
      // Calcular confianza primero
      const calculatedConfidence = Math.min(
        98,
        85 +
          supportResistance.supportStrength * 10 +
          microMovementAnalysis.volumeSpike * 15 +
          vwapAnalysis.meanReversionSignal * 20,
      );

      // Solo activar si confianza >70%
      if (calculatedConfidence > MIN_CONFIDENCE) {
        direction = 'UP';
        confidence = calculatedConfidence;
        expectedMove = Math.min(
          1.5,
          supportResistance.distanceToResistance * 0.8,
        );
        riskLevel =
          supportResistance.supportStrength > 0.9 &&
          vwapAnalysis.meanReversionSignal > 0.5
            ? 'LOW'
            : 'MED';
        console.log(
          '🎯 ACTIVADA: Estrategia 4 - Bounce en soporte (Confianza:',
          calculatedConfidence.toFixed(1) + '%)',
        );
      }
    }
    // 🔥 ESTRATEGIA 5: Volumen + VWAP Mean Reversion (ESTRICTO)
    else if (
      Math.abs(vwapAnalysis.vwapDistance) > 0.6 && // Precio muy alejado del VWAP
      Math.abs(vwapAnalysis.meanReversionSignal) > 0.4 && // Señal fuerte de mean reversion
      microMovementAnalysis.volumeSpike > 0.5 && // Volumen muy alto
      rangeAnalysis.isInRange && // Dentro del rango
      Math.abs(imbalanceAnalysis.bidAskRatio) > 0.2 // Desbalance fuerte en order book
    ) {
      // Calcular confianza primero
      const calculatedConfidence = Math.min(
        85,
        70 +
          Math.abs(vwapAnalysis.meanReversionSignal) * 30 +
          microMovementAnalysis.volumeSpike * 15,
      );

      // Solo activar si confianza >70%
      if (calculatedConfidence > MIN_CONFIDENCE) {
        direction = vwapAnalysis.meanReversionSignal > 0 ? 'UP' : 'DOWN';
        confidence = calculatedConfidence;
        expectedMove = Math.min(1.0, Math.abs(vwapAnalysis.vwapDistance) * 0.6);
        riskLevel = microMovementAnalysis.volumeSpike > 0.5 ? 'LOW' : 'MED';
        console.log(
          '🎯 ACTIVADA: Estrategia 5 - Volumen + VWAP (Confianza:',
          calculatedConfidence.toFixed(1) + '%)',
        );
      }
    }
    // Estrategia 6: VWAP mean reversion (más estricto)
    else if (
      Math.abs(vwapAnalysis.vwapDistance) > 0.8 &&
      Math.abs(vwapAnalysis.meanReversionSignal) > 0.5
    ) {
      // Calcular confianza primero
      const calculatedConfidence = Math.min(
        85,
        60 + Math.abs(vwapAnalysis.meanReversionSignal) * 25,
      );

      // Solo activar si confianza >70%
      if (calculatedConfidence > MIN_CONFIDENCE) {
        direction = vwapAnalysis.meanReversionSignal > 0 ? 'UP' : 'DOWN';
        confidence = calculatedConfidence;
        expectedMove = Math.min(1.0, Math.abs(vwapAnalysis.vwapDistance) * 0.5);
        riskLevel = Math.abs(vwapAnalysis.vwapDistance) > 1.2 ? 'LOW' : 'MED';
        console.log(
          '🎯 ACTIVADA: Estrategia 6 - VWAP mean reversion (Confianza:',
          calculatedConfidence.toFixed(1) + '%)',
        );
      }
    }
    // Estrategia 7: Volumen + Price Position (para balancear)
    else if (
      volumeAnalysis.volumeTrend > 0.3 &&
      Math.abs(pricePosition - 0.5) > 0.3
    ) {
      // Calcular confianza primero
      const calculatedConfidence = Math.min(
        75,
        50 + volumeAnalysis.volumeTrend * 25,
      );

      // Solo activar si confianza >70%
      if (calculatedConfidence > MIN_CONFIDENCE) {
        direction = pricePosition < 0.5 ? 'UP' : 'DOWN';
        confidence = calculatedConfidence;
        expectedMove = Math.min(0.8, Math.abs(pricePosition - 0.5) * 1.5);
        riskLevel = volumeAnalysis.volumeTrend > 0.5 ? 'MED' : 'HIGH';
        console.log(
          '🎯 ACTIVADA: Estrategia 7 - Volumen + Price Position (Confianza:',
          calculatedConfidence.toFixed(1) + '%)',
        );
      }
    }
    // No hay señal clara
    else {
      direction = 'SIDEWAYS';
      confidence = 0;
      expectedMove = 0;
      riskLevel = 'HIGH';
    }
  } else {
    // No está en rango, no operar
    direction = 'SIDEWAYS';
    confidence = 0;
    expectedMove = 0;
    riskLevel = 'HIGH';
  }

  return {
    direction,
    confidence,
    expectedMove,
    riskLevel,
    analysis: {
      rangeAnalysis,
      supportResistance,
      vwapAnalysis,
      bookAnalysis,
      volumeAnalysis,
      microMovementAnalysis,
      imbalanceAnalysis,
    },
    breakdown: {
      momentumScore: rangeScore * 100,
      bookScore: bookScore * 100,
      flowScore: volumeScore * 100,
      climaxScore: levelsScore * 100,
      microScore: microScore * 100,
      imbalanceScore: imbalanceScore * 100,
    },
  };
}

function calculateLevelsScore(supportResistance: SupportResistance): number {
  const supportScore =
    supportResistance.supportStrength *
    (1 - supportResistance.distanceToSupport / 2);
  const resistanceScore =
    supportResistance.resistanceStrength *
    (1 - supportResistance.distanceToResistance / 2);

  return Math.max(supportScore, resistanceScore);
}

export type { HistoricalCandle, PredictionScore };
