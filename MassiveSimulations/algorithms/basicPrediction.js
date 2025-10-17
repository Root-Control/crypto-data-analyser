// Algoritmo basicPrediction - Replicación EXACTA del servidor
// Basado en src/algorithms/basic-prediction.ts que simplemente llama a predictNextCandle

function basicPrediction(historicalCandles, currentBook, minCandles = 3, constants = {}) {
  // Llamar exactamente igual que el servidor
  return predictNextCandle(historicalCandles, currentBook, minCandles, constants);
}

// ============================================================================
// FUNCIÓN predictNextCandle - Replicación EXACTA del servidor
// ============================================================================

function predictNextCandle(historicalCandles, currentBook, minCandles = 3, constants = {}) {
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

  // FASE 1: Análisis de Momentum
  const momentum = analyzeMomentum(historicalCandles, constants);

  // FASE 2: Análisis de Order Book
  const bookPressure = currentBook
    ? analyzeBookPressure(currentBook, historicalCandles, constants)
    : {
        bidAskImbalance: 0,
        spreadTightening: 0,
        depthAsymmetry: 0,
        liquidityLevel: 0,
        momentumAlignment: 0,
      };

  // FASE 3: Análisis de Volume Flow
  const flowScore = analyzeVolumeFlow(historicalCandles, constants);

  // FASE 4: Análisis de Climax
  const climaxScore = analyzeClimaxPressure(historicalCandles, constants);

  // FASE 5: Ponderación y Decisión Final
  return calculateFinalPrediction(
    momentum,
    bookPressure,
    flowScore,
    climaxScore,
    constants,
  );
}

// ============================================================================
// ANÁLISIS DE MOMENTUM - Replicación EXACTA del servidor
// ============================================================================

function analyzeMomentum(candles, constants = {}) {
  // Usar más datos históricos para estadística robusta
  const recentCandlesCount = constants.RECENT_CANDLES_MOMENTUM || 10;
  const recent = candles.slice(-recentCandlesCount); // Últimos N minutos para mejor estadística

  // 1. Price Momentum con soportes/resistencias
  const priceMomentum = calculatePriceMomentumWithSupportResistance(
    candles,
    recent,
  );

  // 2. Volume Momentum (aceleración del volumen)
  const volumeMomentum = calculateVolumeMomentum(recent);

  // 3. Imbalance Trend (dirección del imbalance)
  const imbalanceTrend = calculateImbalanceTrend(recent);

  // 4. Volatility Trend (aumento/disminución de volatilidad)
  const volatilityTrend = calculateVolatilityTrend(recent);

  // 5. Climax Pressure (frecuencia de climax)
  const climaxPressure = calculateClimaxPressure(recent);

  return {
    priceMomentum,
    volumeMomentum,
    imbalanceTrend,
    volatilityTrend,
    climaxPressure,
  };
}

function calculatePriceMomentumWithSupportResistance(allCandles, recentCandles) {
  if (recentCandles.length < 2) return 0;

  const currentPrice = recentCandles[recentCandles.length - 1].close;

  // Calcular soportes y resistencias con datos históricos
  const supportResistance = calculateSupportResistance(allCandles);

  // Momentum básico
  const prices = recentCandles.map((c) => c.close);
  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const basicMomentum = (lastPrice - firstPrice) / firstPrice;

  // Factor de soporte/resistencia
  let srFactor = 0;
  if (
    supportResistance.support &&
    currentPrice <= supportResistance.support * 1.002
  ) {
    srFactor = 0.5; // Cerca del soporte = tendencia alcista
  } else if (
    supportResistance.resistance &&
    currentPrice >= supportResistance.resistance * 0.998
  ) {
    srFactor = -0.5; // Cerca de resistencia = tendencia bajista
  }

  // Combinar momentum básico con soporte/resistencia
  const combinedMomentum = basicMomentum + srFactor;

  return Math.max(-1, Math.min(1, combinedMomentum * 100));
}

function calculateSupportResistance(candles) {
  if (candles.length < 20) return { support: null, resistance: null };

  // Usar últimos 30 velas para soportes/resistencias
  const recentCandles = candles.slice(-30);
  const highs = recentCandles.map((c) => c.high);
  const lows = recentCandles.map((c) => c.low);

  // Encontrar máximos y mínimos locales
  const localHighs = [];
  const localLows = [];

  for (let i = 1; i < highs.length - 1; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1]) {
      localHighs.push(highs[i]);
    }
    if (lows[i] < lows[i - 1] && lows[i] < lows[i + 1]) {
      localLows.push(lows[i]);
    }
  }

  // Calcular resistencias (promedio de máximos locales)
  const resistance =
    localHighs.length > 0
      ? localHighs.reduce((a, b) => a + b, 0) / localHighs.length
      : null;

  // Calcular soportes (promedio de mínimos locales)
  const support =
    localLows.length > 0
      ? localLows.reduce((a, b) => a + b, 0) / localLows.length
      : null;

  return { support, resistance };
}

function calculateVolumeMomentum(candles) {
  if (candles.length < 3) return 0;

  const volumes = candles.map((c) => c.tickVol || 0).filter((v) => v > 0);
  if (volumes.length < 2) return 0;

  // Calcular aceleración del volumen
  const avgEarly =
    volumes
      .slice(0, Math.floor(volumes.length / 2))
      .reduce((a, b) => a + b, 0) / Math.floor(volumes.length / 2);
  const avgLate =
    volumes.slice(-Math.floor(volumes.length / 2)).reduce((a, b) => a + b, 0) /
    Math.floor(volumes.length / 2);

  if (avgEarly === 0) return 0;

  const acceleration = (avgLate - avgEarly) / avgEarly;
  return Math.max(-1, Math.min(1, acceleration));
}

function calculateImbalanceTrend(candles) {
  const imbalances = candles
    .map((c) => c.imbalance || 0)
    .filter((i) => i !== 0);
  if (imbalances.length === 0) return 0;

  // Tendencia del imbalance (regresión simple)
  let sum = 0;
  for (let i = 0; i < imbalances.length; i++) {
    sum += imbalances[i] * (i + 1); // Peso temporal
  }

  const avgImbalance =
    imbalances.reduce((a, b) => a + b, 0) / imbalances.length;
  const trend =
    sum / ((imbalances.length * (imbalances.length + 1)) / 2) - avgImbalance;

  return Math.max(-1, Math.min(1, trend));
}

function calculateVolatilityTrend(candles) {
  if (candles.length < 5) return 0;

  const volatilities = candles.map((c) => Math.abs(c.fluct || 0));

  // Usar más datos para mejor estadística
  const early = volatilities.slice(0, Math.floor(volatilities.length * 0.6));
  const late = volatilities.slice(-Math.floor(volatilities.length * 0.4));

  const avgEarly = early.reduce((a, b) => a + b, 0) / early.length;
  const avgLate = late.reduce((a, b) => a + b, 0) / late.length;

  if (avgEarly === 0) return 0;

  const trend = (avgLate - avgEarly) / avgEarly;

  // Amplificar tendencias de volatilidad para mejor detección
  return Math.max(-1, Math.min(1, trend * 1.5));
}

function calculateClimaxPressure(candles) {
  const climaxCount = candles.filter((c) => c.flags?.climax).length;
  return climaxCount / candles.length;
}

// ============================================================================
// ANÁLISIS DE ORDER BOOK - Replicación EXACTA del servidor
// ============================================================================

function analyzeBookPressure(currentBook, historicalCandles) {
  // 1. Bid/Ask Imbalance (mejorado con análisis del último minuto)
  const bidAskImbalance = calculateBidAskImbalance(currentBook);

  // 2. Spread Tightening
  const spreadTightening = calculateSpreadTightening(
    currentBook,
    historicalCandles,
  );

  // 3. Depth Asymmetry
  const depthAsymmetry = calculateDepthAsymmetry(currentBook);

  // 4. Liquidity Level
  const liquidityLevel = calculateLiquidityLevel(currentBook);

  // 5. Momentum Alignment (mejorado con imbalance del último minuto)
  const momentumAlignment = calculateMomentumAlignmentWithLastMinute(
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

function calculateBidAskImbalance(book) {
  if (!book.totalBidQty || !book.totalAskQty) return 0;

  const total = book.totalBidQty + book.totalAskQty;
  if (total === 0) return 0;

  return (book.totalBidQty - book.totalAskQty) / total;
}

function calculateSpreadTightening(book, candles) {
  if (!book.spreadPct) return 0;

  // Comparar con spread promedio histórico
  const historicalSpreads = candles
    .map((c) => c.book?.spreadPct)
    .filter((s) => s !== undefined);

  if (historicalSpreads.length === 0) return 0;

  const avgHistoricalSpread =
    historicalSpreads.reduce((a, b) => a + b, 0) / historicalSpreads.length;

  if (avgHistoricalSpread === 0) return 0;

  // Spread más pequeño = mayor presión
  const tightening =
    (avgHistoricalSpread - book.spreadPct) / avgHistoricalSpread;
  return Math.max(0, Math.min(1, tightening));
}

function calculateDepthAsymmetry(book) {
  if (!book.bids || !book.asks) return 0;

  // Comparar profundidad en los primeros 5 niveles
  const bidDepth = book.bids
    .slice(0, 5)
    .reduce((sum, level) => sum + parseFloat(level.qty), 0);
  const askDepth = book.asks
    .slice(0, 5)
    .reduce((sum, level) => sum + parseFloat(level.qty), 0);

  const total = bidDepth + askDepth;
  if (total === 0) return 0;

  return (bidDepth - askDepth) / total;
}

function calculateLiquidityLevel(book) {
  if (!book.totalBidQty || !book.totalAskQty) return 0;

  const totalLiquidity = book.totalBidQty + book.totalAskQty;

  // Normalizar basado en niveles típicos de ETHUSDT
  // 100+ ETH = alta liquidez, 10-100 = media, <10 = baja
  if (totalLiquidity >= 100) return 1;
  if (totalLiquidity >= 10) return 0.5;
  return 0.1;
}

function calculateMomentumAlignmentWithLastMinute(book, candles) {
  if (candles.length === 0) return 0;

  // Imbalance del último minuto (más relevante)
  const lastMinuteImbalance = candles[candles.length - 1]?.imbalance || 0;
  const bookImbalance = book.imbalance || 0;

  // Imbalance promedio de últimos 3 minutos para contexto
  const recentImbalances = candles.slice(-3).map((c) => c.imbalance || 0);
  const avgRecentImbalance =
    recentImbalances.reduce((a, b) => a + b, 0) / recentImbalances.length;

  // Peso más alto al último minuto (60%) vs promedio reciente (40%)
  const weightedImbalance =
    lastMinuteImbalance * 0.6 + avgRecentImbalance * 0.4;

  // Alineación mejorada
  if (Math.abs(weightedImbalance) < 0.05 && Math.abs(bookImbalance) < 0.05) {
    return 0.3; // Ambos neutrales
  }

  if (weightedImbalance > 0.1 && bookImbalance > 0.1) return 1; // Ambos alcistas
  if (weightedImbalance < -0.1 && bookImbalance < -0.1) return 1; // Ambos bajistas

  if (weightedImbalance > 0.1 && bookImbalance < -0.1) return -1; // Desalineación total
  if (weightedImbalance < -0.1 && bookImbalance > 0.1) return -1; // Desalineación total

  return 0.5; // Alineación parcial
}

// ============================================================================
// ANÁLISIS DE VOLUME FLOW - Replicación EXACTA del servidor
// ============================================================================

function analyzeVolumeFlow(candles) {
  if (candles.length < 2) return 0;

  const recent = candles.slice(-3); // Últimos 3 minutos

  // Calcular fuerza del flujo de volumen
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

  return Math.max(-1, Math.min(1, flowStrength / validCandles));
}

// ============================================================================
// ANÁLISIS DE CLIMAX - Replicación EXACTA del servidor
// ============================================================================

function analyzeClimaxPressure(candles) {
  const recent = candles.slice(-5); // Últimos 5 minutos

  let climaxScore = 0;
  let validCandles = 0;

  for (const candle of recent) {
    if (candle.flags) {
      let candleScore = 0;

      if (candle.flags.climax) candleScore += 0.5;
      if (candle.flags.bullish) candleScore += 0.3;
      if (candle.flags.bearish) candleScore -= 0.3;

      climaxScore += candleScore;
      validCandles++;
    }
  }

  if (validCandles === 0) return 0;

  return Math.max(-1, Math.min(1, climaxScore / validCandles));
}

// ============================================================================
// CÁLCULO FINAL DE PREDICCIÓN - Replicación EXACTA del servidor
// ============================================================================

function calculateFinalPrediction(momentum, bookPressure, flowScore, climaxScore) {
  // Ponderación de factores (optimizada para PnL máximo)
  const weights = {
    momentum: 0.45, // 45% - Momentum histórico (máximo peso)
    book: 0.3, // 30% - Order book actual
    flow: 0.2, // 20% - Volume flow (aumentado)
    climax: 0.05, // 5% - Presión de climax (mínimo)
  };

  // Calcular score de momentum (amplificado para PnL)
  const momentumScore =
    momentum.priceMomentum * 0.5 + // Más peso al precio
    momentum.volumeMomentum * 0.3 +
    momentum.imbalanceTrend * 0.2;

  // Calcular score de book
  const bookScore =
    bookPressure.bidAskImbalance * 0.4 +
    bookPressure.depthAsymmetry * 0.3 +
    bookPressure.momentumAlignment * 0.3;

  // Score final ponderado
  const finalScore =
    momentumScore * weights.momentum +
    bookScore * weights.book +
    flowScore * weights.flow +
    climaxScore * weights.climax;

  // Determinar dirección (optimizado para MAXIMIZAR PnL)
  let direction = 'SIDEWAYS';

  // Estrategia de PnL: buscar señales fuertes que generen movimientos grandes
  const strongMomentum = Math.abs(momentumScore) > 0.4; // Señal muy fuerte
  const strongBook = Math.abs(bookScore) > 0.3; // Order book muy sesgado
  const strongFlow = Math.abs(flowScore) > 0.25; // Flujo de volumen intenso

  // Solo hacer trade en señales MUY FUERTES (mayor PnL potencial)
  const isVeryStrongSignal = strongMomentum || (strongBook && strongFlow);

  if (finalScore > 0.3 && isVeryStrongSignal)
    direction = 'UP'; // Solo señales muy fuertes
  else if (finalScore < -0.3 && isVeryStrongSignal)
    direction = 'DOWN'; // Solo señales muy fuertes
  else direction = 'SIDEWAYS';

  // Calcular confianza
  const confidence = Math.min(95, Math.abs(finalScore) * 100);

  // Calcular movimiento esperado
  const expectedMove = Math.abs(finalScore) * 2; // 0-2% máximo

  // Determinar nivel de riesgo
  let riskLevel = 'HIGH';
  if (confidence > 70 && bookPressure.liquidityLevel > 0.5) riskLevel = 'LOW';
  else if (confidence > 50 && bookPressure.liquidityLevel > 0.3)
    riskLevel = 'MED';

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

module.exports = { basicPrediction };