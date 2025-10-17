const mongoose = require('mongoose');
const CandleAnalyst = require('./database/candleAnalyst');
const { basicPrediction } = require('./algorithms/basicPrediction');

const { config } = require('dotenv');
config({ path: '../.env' }); 

const useOptimalConfig = true;

const optimalConfig = {
  TP_MULTIPLIER: 1.2,         
  TP_MAX_PERCENT: 0.005,       
  SL_PERCENT: 0.002,          
  FINAL_SCORE_THRESHOLD: 0.4,       
  RECENT_CANDLES_MOMENTUM: 15,       
  FLOW_RECENT_CANDLES: 3,           
  CLIMAX_RECENT_CANDLES: 7,         
}

// ============================================================================
// TODAS LAS CONSTANTES DEL SISTEMA - CONFIGURACIÓN CENTRALIZADA
// ============================================================================

// ============================================================================
// CONFIGURACIÓN PRINCIPAL DE SIMULACIÓN
// ============================================================================
const SYMBOL = 'ETHUSDT';
const CAPITAL = 400;
const LEVERAGE = 10;


// ============================================================================
// CONFIGURACIÓN DE TRADING
// ============================================================================
const TP_MULTIPLIER = useOptimalConfig ? optimalConfig.TP_MULTIPLIER: 1.2;          // Multiplicador de Take Profit [1.0, 1.1, 1.2, 1.5, 2.0, 3.0]
const TP_MAX_PERCENT = useOptimalConfig ? optimalConfig.TP_MAX_PERCENT: 0.005;       // Take Profit máximo [0.005, 0.01, 0.015, 0.025, 0.05, 0.1]
const SL_PERCENT = useOptimalConfig ? optimalConfig.SL_PERCENT: 0.002;           // Stop Loss [0.002, 0.005, 0.008, 0.01, 0.02, 0.05]
const MOVEMENT_THRESHOLD =  0.2;     // Umbral de movimiento para clasificar dirección

// ============================================================================
// CONFIGURACIÓN DE FILTRADO DE DATOS
// ============================================================================
const MIN_SEQUENCE_LENGTH = 3;      // Mínimo de bloques para secuencia válida (min: 2, max: 10)
const MAX_GAP_MINUTES = 60;         // Gap máximo permitido entre bloques (min: 15, max: 240)
const INTERVAL_MINUTES = 15;        // Intervalo entre bloques (min: 5, max: 60)
const DEBUG_GAP_THRESHOLD = 60;     // Mostrar gaps mayores a X minutos (min: 30, max: 180)
const SHOW_LAST_BLOCKS = 5;         // Mostrar últimos X bloques (min: 3, max: 20)
const MIN_BLOCKS_FOR_SIMULATION = 3; // Mínimo de bloques para simulación (min: 2, max: 10)

// ============================================================================
// CONFIGURACIÓN DE CONEXIÓN Y LOGGING
// ============================================================================
const MONGODB_URI = `mongodb://localhost:27017/${process.env.DB_LABORATORY_NAME}`;

const TOP_TRADES_COUNT = 5;         // Mostrar top 5 mejores/peores trades

// ============================================================================
// CONFIGURACIÓN DE PRECISIÓN Y FORMATO
// ============================================================================
const PRICE_ROUNDING = 100;         // Redondeo a 2 decimales
const PNL_ROUNDING = 100;           // Redondeo de P&L
const PERCENTAGE_ROUNDING = 100;    // Redondeo de porcentajes

// ============================================================================
// CONSTANTES DEL ALGORITMO DE PREDICCIÓN
// ============================================================================

// Ponderaciones de factores principales
const ALGORITHM_WEIGHTS = {
  momentum: 0.45,    // 45% - Momentum histórico (máximo peso)
  book: 0.3,         // 30% - Order book actual
  flow: 0.2,         // 20% - Volume flow
  climax: 0.05,      // 5% - Presión de climax (mínimo)
};

// Ponderaciones de momentum
const MOMENTUM_WEIGHTS = {
  price: 0.5,        // 50% - Precio
  volume: 0.3,       // 30% - Volumen
  imbalance: 0.2,    // 20% - Imbalance
};

// Ponderaciones de order book
const BOOK_WEIGHTS = {
  bidAskImbalance: 0.4,    // 40% - Imbalance bid/ask
  depthAsymmetry: 0.3,     // 30% - Asimetría de profundidad
  momentumAlignment: 0.3,  // 30% - Alineación de momentum
};

// Umbrales de señales fuertes
const STRONG_MOMENTUM_THRESHOLD = 0.4;    // Señal muy fuerte de momentum
const STRONG_BOOK_THRESHOLD = 0.3;        // Order book muy sesgado
const STRONG_FLOW_THRESHOLD = 0.25;       // Flujo de volumen intenso



  //const FINAL_SCORE_THRESHOLD =   [0.2, 0.3, 0.4, 0.5];
  //const RECENT_CANDLES_MOMENTUM = [5, 10, 15, 20];    
  //const FLOW_RECENT_CANDLES =     [2, 3, 5, 7];          
  //const CLIMAX_RECENT_CANDLES =   [3, 5, 7, 10];       
    

// Umbrales de decisión
const FINAL_SCORE_THRESHOLD = 0.4;        // Umbral para UP/DOWN vs SIDEWAYS

// Configuración de análisis temporal
const RECENT_CANDLES_MOMENTUM = 15;       // Últimos N minutos para momentum
const SUPPORT_RESISTANCE_CANDLES = 30;    // Últimos N velas para soporte/resistencia
const FLOW_RECENT_CANDLES = 3;            // Últimos N minutos para volume flow
const CLIMAX_RECENT_CANDLES = 7;          // Últimos N minutos para climax

// Configuración de soporte/resistencia
const SUPPORT_TOLERANCE = 1.002;          // Tolerancia de soporte (0.2%)
const RESISTANCE_TOLERANCE = 0.998;       // Tolerancia de resistencia (0.2%)
const SUPPORT_RESISTANCE_FACTOR = 0.5;    // Factor de soporte/resistencia

// Configuración de liquidez
const HIGH_LIQUIDITY_THRESHOLD = 100;     // Alta liquidez
const MEDIUM_LIQUIDITY_THRESHOLD = 10;    // Media liquidez

// Configuración de momentum alignment
const LAST_MINUTE_WEIGHT = 0.6;           // 60% peso último minuto
const RECENT_AVG_WEIGHT = 0.4;            // 40% peso promedio reciente

// Configuración de climax
const CLIMAX_FLAG_WEIGHT = 0.5;           // Peso de flag climax
const BULLISH_FLAG_WEIGHT = 0.3;          // Peso de flag bullish
const BEARISH_FLAG_WEIGHT = 0.3;          // Peso de flag bearish

// Configuración de salida
const CONFIDENCE_MULTIPLIER = 100;        // Multiplicador de confianza
const EXPECTED_MOVE_MULTIPLIER = 2;       // Multiplicador de movimiento esperado
const MAX_CONFIDENCE = 95;                // Máxima confianza permitida

// Configuración de volatilidad
const VOLATILITY_AMPLIFIER = 1.5;         // Amplificador de tendencias de volatilidad

// Configuración de balance de momentum
const NEUTRAL_IMBALANCE_THRESHOLD = 0.05; // Umbral de imbalance neutral
const STRONG_IMBALANCE_THRESHOLD = 0.1;   // Umbral de imbalance fuerte

// Configuración de niveles de riesgo
const HIGH_LIQUIDITY_RISK = 0.5;          // Riesgo bajo con alta liquidez
const MEDIUM_LIQUIDITY_RISK = 0.3;        // Riesgo medio con media liquidez

// ============================================================================
// CONFIGURACIÓN DE COLORES PARA LOGS
// ============================================================================
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Función getLongestSequence (igual que el servidor)
function getLongestSequence(blocks, showDetailedLogs = true) {
  // Encontrar la secuencia más larga sin gaps
  const sequences = [];
  let currentSequence = [blocks[0]];

  for (let i = 1; i < blocks.length; i++) {
    const prevBlock = blocks[i - 1];
    const currentBlock = blocks[i];

    const prevTime = new Date(
      `${prevBlock.startDate}T${prevBlock.startTime}:00`,
    );
    const currentTime = new Date(
      `${currentBlock.startDate}T${currentBlock.startTime}:00`,
    );
    const diffMinutes =
      (currentTime.getTime() - prevTime.getTime()) / (1000 * 60);

    if (diffMinutes === INTERVAL_MINUTES) {
      // Continuar la secuencia
      currentSequence.push(currentBlock);
    } else {
      // Debug para gaps grandes
      if (showDetailedLogs && diffMinutes > DEBUG_GAP_THRESHOLD) {
        console.log(`🔍 Gap detectado: ${prevBlock.startDate}_${prevBlock.startTime} -> ${currentBlock.startDate}_${currentBlock.startTime} (${diffMinutes} minutos)`);
      }
      
      // Guardar secuencia actual y empezar nueva
      if (currentSequence.length >= MIN_SEQUENCE_LENGTH) {
        sequences.push(currentSequence);
      }
      // NO empezar nueva secuencia con bloques que no tienen continuidad
      // Solo continuar si el gap es razonable (menos de 1 hora)
      if (diffMinutes <= MAX_GAP_MINUTES) {
        currentSequence = [currentBlock];
      } else {
        // Gap muy grande, no incluir este bloque
        if (showDetailedLogs) {
          console.log(`❌ Eliminando bloque ${currentBlock.startDate}_${currentBlock.startTime} por gap de ${diffMinutes} minutos`);
        }
        currentSequence = [];
      }
    }
  }

  // Agregar la última secuencia solo si tiene continuidad
  if (currentSequence.length >= MIN_SEQUENCE_LENGTH) {
    sequences.push(currentSequence);
  }

  // Retornar la secuencia más larga
  if (sequences.length === 0) {
    console.log('❌ No se encontraron secuencias válidas');
    return [];
  }

  const longestSequence = sequences.reduce((longest, current) =>
    current.length > longest.length ? current : longest,
  );

  if (showDetailedLogs) {
    console.log(`🏆 Secuencia más larga: ${longestSequence.length} bloques`);
  }
  return longestSequence;
}


// Función para colorear texto
function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// Función convertBlocksToHistoricalCandles (igual que el servidor)
function convertBlocksToHistoricalCandles(blocks) {
  const candles = [];

  for (const block of blocks) {
    for (const analysis of block.analysis) {
      candles.push({
        minute: analysis.minute,
        open: analysis.open,
        high: analysis.high,
        low: analysis.low,
        close: analysis.close,
        fluct: analysis.fluct,
        tickVol: analysis.tickVol,
        buyVol: analysis.buyVol,
        sellVol: analysis.sellVol,
        delta: analysis.delta,
        imbalance: analysis.imbalance,
        vwap: analysis.vwap,
        tickCount: analysis.tickCount,
        flags: analysis.flags,
        book: analysis.book,
      });
    }
  }

  return candles;
}

// Función calculateTradingSetup (igual que el servidor)
function calculateTradingSetup(currentBlock, prediction, capital, leverage, config = {}) {
  // Precio de entrada: último precio conocido del bloque actual (momento de la predicción)
  const entryPrice = currentBlock.analysis[currentBlock.analysis.length - 1].close;

  // Calcular TAKE PROFIT y STOP LOSS mejorado (ANTES del trade)
  const expectedMovePercent = prediction.expectedMove / 100; // Convertir a decimal
  
  // Usar config si está disponible, sino usar valores por defecto
  const tpMultiplier = config.tpMultiplier || TP_MULTIPLIER;
  const tpMaxPercent = config.tpMaxPercent || TP_MAX_PERCENT;
  const slPercent = config.slPercent || SL_PERCENT;
  
  const takeProfitPercent = Math.min(expectedMovePercent * tpMultiplier, tpMaxPercent); // 120% del movimiento esperado, max 2.5%
  const stopLossPercent = slPercent; // 0.8% Stop Loss

  let takeProfitPrice = 0;
  let stopLossPrice = 0;
  let positionSize = 0;

  if (prediction.direction === 'UP') {
    // Long position - Take Profit hacia arriba, Stop Loss hacia abajo
    takeProfitPrice = entryPrice * (1 + takeProfitPercent);
    stopLossPrice = entryPrice * (1 - stopLossPercent);
    positionSize = (capital * leverage) / entryPrice;
  } else if (prediction.direction === 'DOWN') {
    // Short position - Take Profit hacia abajo, Stop Loss hacia arriba
    takeProfitPrice = entryPrice * (1 - takeProfitPercent);
    stopLossPrice = entryPrice * (1 + stopLossPercent);
    positionSize = (capital * leverage) / entryPrice;
  } else {
    // SIDEWAYS - no trade
    return {
      entryPrice,
      takeProfitPrice: 0,
      stopLossPrice: 0,
      positionSize: 0,
      leverage,
      capital,
      expectedMove: prediction.expectedMove,
      takeProfitPercent: 0,
      stopLossPercent: 0,
      direction: 'SIDEWAYS',
    };
  }

  return {
    entryPrice,
    takeProfitPrice,
    stopLossPrice,
    positionSize,
    leverage,
    capital,
    expectedMove: prediction.expectedMove,
    takeProfitPercent: takeProfitPercent * 100,
    stopLossPercent: stopLossPercent * 100,
    direction: prediction.direction,
  };
}

// Función getResults (igual que el servidor)
function getResults(blockPrediction, blockSnapshot) {
  // Si no hay predicción o es SIDEWAYS, no evaluar
  if (!blockPrediction || blockPrediction.direction === 'SIDEWAYS') {
    return {
      exists: false,
    };
  }

  // Si no hay bloque real, no hay datos
  if (
    !blockSnapshot ||
    !blockSnapshot.analysis ||
    blockSnapshot.analysis.length === 0
  ) {
    return {
      exists: false,
    };
  }

  try {
    // Obtener datos del bloque real
    const firstCandle = blockSnapshot.analysis[0];
    const lastCandle = blockSnapshot.analysis[blockSnapshot.analysis.length - 1];

    if (!firstCandle || !lastCandle) {
      return { exists: false };
    }

    // Calcular dirección real
    const actualMove = ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100;
    const actualDirection = actualMove > MOVEMENT_THRESHOLD ? 'UP' : actualMove < -MOVEMENT_THRESHOLD ? 'DOWN' : 'SIDEWAYS';

    // Obtener setup de trading de la predicción
    const trading = blockPrediction.trading;
    if (!trading) {
      return {
        exists: true,
        actualDirection,
        actualMove,
        pnl: 0,
        pnlPercent: 0,
        takeProfitReached: false,
        stopLossReached: false,
        exitPrice: lastCandle.close,
        exitReason: 'END_OF_BLOCK',
      };
    }

    // Simular el trade minuto a minuto
    const entryPrice = trading.entryPrice;
    const takeProfitPrice = trading.takeProfitPrice;
    const stopLossPrice = trading.stopLossPrice;
    const positionSize = trading.positionSize;
    const direction = blockPrediction.direction;

    // Encontrar precio máximo y mínimo durante el bloque
    let maxPrice = firstCandle.high;
    let minPrice = firstCandle.low;

    for (const candle of blockSnapshot.analysis) {
      if (candle.high > maxPrice) maxPrice = candle.high;
      if (candle.low < minPrice) minPrice = candle.low;
    }

    // Simular ejecución del trade
    let exitPrice = lastCandle.close;
    let exitReason = 'END_OF_BLOCK';
    let takeProfitReached = false;
    let stopLossReached = false;

    // Verificar si se alcanzó take profit o stop loss
    if (direction === 'UP') {
      // Long position
      if (maxPrice >= takeProfitPrice) {
        exitPrice = takeProfitPrice;
        exitReason = 'TAKE_PROFIT';
        takeProfitReached = true;
      } else if (minPrice <= stopLossPrice) {
        exitPrice = stopLossPrice;
        exitReason = 'STOP_LOSS';
        stopLossReached = true;
      }
    } else if (direction === 'DOWN') {
      // Short position
      // Verificación estricta: el precio debe bajar por debajo del TP
      if (minPrice < takeProfitPrice) {
        exitPrice = takeProfitPrice;
        exitReason = 'TAKE_PROFIT';
        takeProfitReached = true;
      } else if (maxPrice > stopLossPrice) {
        exitPrice = stopLossPrice;
        exitReason = 'STOP_LOSS';
        stopLossReached = true;
      }
      
      // Verificación de consistencia: si el mínimo es mayor que el precio de salida, es END_OF_BLOCK
      if (minPrice > lastCandle.close) {
        exitPrice = lastCandle.close;
        exitReason = 'END_OF_BLOCK';
        takeProfitReached = false;
        stopLossReached = false;
      }
    }


    // Calcular P&L
    let pnl = 0;
    let pnlPercent = 0;

    if (direction === 'UP') {
      // Long: P&L = (exit - entry) * positionSize
      pnl = (exitPrice - entryPrice) * positionSize;
      pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
    } else if (direction === 'DOWN') {
      // Short: P&L = (entry - exit) * positionSize
      pnl = (entryPrice - exitPrice) * positionSize;
      pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
    }

    // Calcular movimientos máximos
    const maxMovePercent = ((maxPrice - entryPrice) / entryPrice) * 100;
    const minMovePercent = ((minPrice - entryPrice) / entryPrice) * 100;

    return {
      exists: true,
      actualDirection,
      actualMove,
      pnl: Math.round(pnl * PNL_ROUNDING) / PNL_ROUNDING,
      pnlPercent: Math.round(pnlPercent * PERCENTAGE_ROUNDING) / PERCENTAGE_ROUNDING,
      takeProfitReached,
      stopLossReached,
      exitPrice: Math.round(exitPrice * PRICE_ROUNDING) / PRICE_ROUNDING,
      exitReason,
      details: {
        open: Math.round(firstCandle.open * PRICE_ROUNDING) / PRICE_ROUNDING,
        close: Math.round(lastCandle.close * PRICE_ROUNDING) / PRICE_ROUNDING,
        entryPrice: Math.round(entryPrice * PRICE_ROUNDING) / PRICE_ROUNDING,
        takeProfitPrice: Math.round(takeProfitPrice * PRICE_ROUNDING) / PRICE_ROUNDING,
        stopLossPrice: Math.round(stopLossPrice * PRICE_ROUNDING) / PRICE_ROUNDING,
        maxPrice: Math.round(maxPrice * PRICE_ROUNDING) / PRICE_ROUNDING,
        minPrice: Math.round(minPrice * PRICE_ROUNDING) / PRICE_ROUNDING,
        finalPrice: Math.round(lastCandle.close * PRICE_ROUNDING) / PRICE_ROUNDING,
        maxMovePercent: Math.round(maxMovePercent * PERCENTAGE_ROUNDING) / PERCENTAGE_ROUNDING,
        minMovePercent: Math.round(minMovePercent * PERCENTAGE_ROUNDING) / PERCENTAGE_ROUNDING,
      },
    };
  } catch (error) {
    console.error('Error evaluating results:', error);
    return {
      exists: false,
    };
  }
}

// Función shouldRemoveSubsequentBlocks (igual que el servidor)
function shouldRemoveSubsequentBlocks(currentIndex, totalBlocks) {
  // Si es el último bloque, no eliminar posteriores
  if (currentIndex === totalBlocks - 1) return false;

  // Si es el primero, solo eliminar si hay muchos bloques
  if (currentIndex === 0) return totalBlocks > 10;

  // Si está en el centro, eliminar posteriores para mantener continuidad
  return true;
}

// Función principal de simulación
async function runBasicSimulation(
  showDetailedLogs = true, 
  config = {
    FINAL_SCORE_THRESHOLD: FINAL_SCORE_THRESHOLD,
    RECENT_CANDLES_MOMENTUM: RECENT_CANDLES_MOMENTUM,
    CLIMAX_RECENT_CANDLES: CLIMAX_RECENT_CANDLES,
    FLOW_RECENT_CANDLES: FLOW_RECENT_CANDLES,
    tpMultiplier: TP_MULTIPLIER,
    tpMaxPercent: TP_MAX_PERCENT,
    slPercent: SL_PERCENT,
    mongooseConnection: null,
  }
) {
  try {
    if (showDetailedLogs) {
      console.log('🚀 Iniciando simulación basicPrediction...');
      console.log(`📊 Símbolo: ${SYMBOL}`);
      console.log(`💰 Capital: $${CAPITAL}`);
      console.log(`⚡ Leverage: ${LEVERAGE}x`);
      
      // Mostrar configuración de trading
      console.log(`📈 TP Multiplier: ${config.tpMultiplier}`);
      console.log(`📊 TP Max Percent: ${(config.tpMaxPercent * 100).toFixed(2)}%`);
      console.log(`🛑 SL Percent: ${(config.slPercent * 100).toFixed(2)}%`);
      console.log('');
    }

    // Usar conexión existente o conectar a MongoDB
    if (config.mongooseConnection && config.mongooseConnection.connection.readyState === 1) {
      // Usar la conexión existente pasada como parámetro
      if (showDetailedLogs) {
        console.log('✅ Usando conexión MongoDB existente');
      }
    } else if (!config.mongooseConnection) {
      // Conectar a MongoDB si no hay conexión existente
      await mongoose.connect(MONGODB_URI);
      if (showDetailedLogs) {
        console.log('✅ Conectado a MongoDB');
      }
    } else {
      // Si hay una conexión pero no está lista, esperar
      if (showDetailedLogs) {
        console.log('⏳ Esperando conexión MongoDB...');
      }
      await new Promise((resolve) => {
        const checkConnection = () => {
          if (config.mongooseConnection.connection.readyState === 1) {
            resolve();
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
      if (showDetailedLogs) {
        console.log('✅ Conexión MongoDB lista');
      }
    }

    // Obtener todos los bloques (igual que el servidor)
    const allBlocks = await CandleAnalyst.find({ pair: SYMBOL })
      .sort({ startDate: 1, startTime: 1 })
      .lean();

    if (showDetailedLogs) {
      console.log(`📈 Total de bloques encontrados: ${allBlocks.length}`);
    }
    
    // Aplicar el mismo filtro que el servidor: getLongestSequence
    const candleBlocks = getLongestSequence(allBlocks, showDetailedLogs);
    if (showDetailedLogs) {
      console.log(`📊 Bloques sanitizados: ${candleBlocks.length}`);
      
      // Mostrar los últimos bloques para verificar
      console.log(`🔍 Últimos ${SHOW_LAST_BLOCKS} bloques:`);
      candleBlocks.slice(-SHOW_LAST_BLOCKS).forEach((block, index) => {
        console.log(`   ${candleBlocks.length - SHOW_LAST_BLOCKS + index + 1}. ${block.startDate}_${block.startTime} (${block.status})`);
      });
    }

    if (candleBlocks.length < MIN_BLOCKS_FOR_SIMULATION) {
      if (showDetailedLogs) {
        console.log('❌ No hay suficientes bloques para la simulación');
      }
      return;
    }

    // Procesar predicciones (igual que el servidor)
    const trades = [];
    let totalPredictions = 0;
    let upPredictions = 0;
    let downPredictions = 0;
    let sidewaysPredictions = 0;

    // Bucle principal (igual que el servidor: empieza en i=0)
    for (let i = 0; i < candleBlocks.length; i++) {
      const currentBlock = candleBlocks[i];
      const nextBlock = i < candleBlocks.length - 1 ? candleBlocks[i + 1] : null;

      // Debug: mostrar bloques que se están procesando (solo si showDetailedLogs es true)
      if (showDetailedLogs && currentBlock.startDate === '2025-10-16' && currentBlock.startTime === '09:45') {
        console.log(`🔍 Procesando bloque: ${currentBlock.startDate}_${currentBlock.startTime}`);
        console.log(`   Next block: ${nextBlock ? `${nextBlock.startDate}_${nextBlock.startTime}` : 'null'}`);
      }

      // Solo procesar si hay siguiente bloque para evaluar
      if (!nextBlock) {
        continue;
      }

      // Convertir bloques históricos a velas (igual que el servidor)
      const historicalBlocks = candleBlocks.slice(0, i + 1);
      const historicalCandles = convertBlocksToHistoricalCandles(historicalBlocks);

      // Obtener order book del último minuto del bloque actual
      const currentBook = currentBlock.analysis[currentBlock.analysis.length - 1]?.book || null;

      // Generar predicción usando basicPrediction con parámetros del algoritmo
      const algorithmParams = {
        FINAL_SCORE_THRESHOLD: config.FINAL_SCORE_THRESHOLD,
        RECENT_CANDLES_MOMENTUM: config.RECENT_CANDLES_MOMENTUM,
        FLOW_RECENT_CANDLES: config.FLOW_RECENT_CANDLES,
        CLIMAX_RECENT_CANDLES: config.CLIMAX_RECENT_CANDLES,
      };

      const prediction = basicPrediction(historicalCandles, currentBook, 3, algorithmParams);

      totalPredictions++;

      // Contar tipos de predicciones
      if (prediction.direction === 'UP') upPredictions++;
      else if (prediction.direction === 'DOWN') downPredictions++;
      else sidewaysPredictions++;

      // Solo procesar si no es SIDEWAYS y hay siguiente bloque
      if (prediction.direction !== 'SIDEWAYS' && nextBlock) {
        // Calcular trading setup
        const tradingSetup = calculateTradingSetup(currentBlock, prediction, CAPITAL, LEVERAGE, config);

        // Crear predicción con trading setup
        const predictionWithTrading = {
          ...prediction,
          trading: tradingSetup,
        };

        // Evaluar resultado
        const result = getResults(predictionWithTrading, nextBlock);

        if (result.exists) {
          const blockId = `${currentBlock.startDate}_${currentBlock.startTime}`;
          
          // Calcular P&L máximo posible
          const maxPossiblePnL = prediction.direction === 'UP' 
            ? (result.details.maxPrice - result.details.entryPrice) * tradingSetup.positionSize
            : (result.details.entryPrice - result.details.minPrice) * tradingSetup.positionSize;

          // Calcular P&L objetivo (TP)
          const tpTargetPnL = prediction.direction === 'UP'
            ? (result.details.takeProfitPrice - result.details.entryPrice) * tradingSetup.positionSize
            : (result.details.entryPrice - result.details.takeProfitPrice) * tradingSetup.positionSize;

          trades.push({
            blockId,
            direction: prediction.direction,
            confidence: prediction.confidence,
            expectedMove: prediction.expectedMove,
            pnl: result.pnl,
            pnlPercent: result.pnlPercent,
            actualDirection: result.actualDirection,
            actualMove: result.actualMove,
            takeProfitReached: result.takeProfitReached,
            stopLossReached: result.stopLossReached,
            exitReason: result.exitReason,
            details: result.details,
            maxPossiblePnL: Math.round(maxPossiblePnL * PNL_ROUNDING) / PNL_ROUNDING,
            tpTargetPnL: Math.round(tpTargetPnL * PNL_ROUNDING) / PNL_ROUNDING,
          });
        }
      }
    }

    // Calcular estadísticas
    const totalTrades = trades.length;
    const wonTrades = trades.filter(trade => trade.pnl > 0).length;
    const lostTrades = trades.filter(trade => trade.pnl < 0).length;
    const correctTrades = trades.filter(t => t.actualDirection === t.direction).length;
    const accuracy = totalTrades > 0 ? (correctTrades / totalTrades) * 100 : 0;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
    const pnlPercent = totalTrades > 0 ? (totalPnL / (CAPITAL * totalTrades)) * 100 : 0;
    const totalCapital = CAPITAL * totalTrades;

    // Separar trades por dirección
    const upTrades = trades.filter(t => t.direction === 'UP');
    const downTrades = trades.filter(t => t.direction === 'DOWN');
    const upPnL = upTrades.reduce((sum, t) => sum + t.pnl, 0);
    const downPnL = downTrades.reduce((sum, t) => sum + t.pnl, 0);
    const upAccuracy = upTrades.length > 0 ? (upTrades.filter(t => t.actualDirection === 'UP').length / upTrades.length) * 100 : 0;
    const downAccuracy = downTrades.length > 0 ? (downTrades.filter(t => t.actualDirection === 'DOWN').length / downTrades.length) * 100 : 0;

    // Contar tipos de salida
    const tpReached = trades.filter(t => t.takeProfitReached).length;
    const slReached = trades.filter(t => t.stopLossReached).length;
    const endOfBlock = trades.filter(t => t.exitReason === 'END_OF_BLOCK').length;

    // Mostrar resultados
    console.log('');
    // Mostrar análisis de resultados (solo si showDetailedLogs es true)
    if (showDetailedLogs) {
      console.log('📊 ANÁLISIS DE RESULTADOS');
      console.log('============================================================');
      console.log(`📈 Total de predicciones: ${totalPredictions}`);
      console.log(`🎯 Total de trades: ${totalTrades}`);
      console.log(`🟢 Predicciones UP: ${upPredictions} (${((upPredictions/totalPredictions)*100).toFixed(1)}%)`);
      console.log(`🔴 Predicciones DOWN: ${downPredictions} (${((downPredictions/totalPredictions)*100).toFixed(1)}%)`);
      console.log(`🟡 Predicciones SIDEWAYS: ${sidewaysPredictions} (${((sidewaysPredictions/totalPredictions)*100).toFixed(1)}%)`);
      console.log('');
      console.log(`🎯 Precisión: ${correctTrades}/${totalTrades} (${accuracy.toFixed(2)}%)`);
      console.log(`💰 P&L Total: $${totalPnL.toFixed(2)}`);
      console.log(`📊 P&L Promedio por trade: $${avgPnL.toFixed(2)}`);
      console.log(`📈 P&L Porcentual: ${pnlPercent.toFixed(2)}%`);
      console.log(`💵 Capital total invertido: $${totalCapital.toFixed(2)}`);
      console.log('');
    }

    // Mostrar todos los trades individuales (solo si showDetailedLogs es true)
    if (showDetailedLogs) {
      console.log('🔍 DEBUG - TODOS los PnL individuales:');
      trades.forEach((trade, index) => {
        const pnlColor = trade.pnl >= 0 ? 'green' : 'red';
        const maxColor = trade.maxPossiblePnL >= 0 ? 'green' : 'red';
        const tpColor = trade.tpTargetPnL >= 0 ? 'green' : 'red';
        const directionColor = trade.actualDirection === trade.direction ? 'green' : 'red';
        
        console.log(`${index + 1}. ${trade.blockId} | ${trade.direction}`);
        console.log(`   Entry: $${trade.details.entryPrice} | Exit: $${trade.details.finalPrice} | Size: ${trade.details.positionSize || 'N/A'}`);
        console.log(`   Move: ${trade.actualMove.toFixed(2)}% | P&L: ${colorize('$' + trade.pnl.toFixed(2), pnlColor)} | ${colorize(trade.actualDirection, directionColor)}`);
        console.log(`   Details: open=${trade.details.open}, close=${trade.details.close}, high=${trade.details.maxPrice}, low=${trade.details.minPrice}`);
        
        if (trade.exitReason === 'END_OF_BLOCK') {
          console.log(`   🔴 END OF BLOCK`);
        } else {
          console.log(`   ${trade.exitReason === 'TAKE_PROFIT' ? '🟢' : '🔴'} ${trade.exitReason}`);
        }
        console.log('');
      });
    }


    // Separar trades por tipo de salida
    const endOfBlockTrades = trades.filter(trade => trade.exitReason === 'END_OF_BLOCK');
    const tpSlTrades = trades.filter(trade => trade.exitReason !== 'END_OF_BLOCK');

    // Mostrar trades que terminaron en END_OF_BLOCK (solo si showDetailedLogs es true)
    if (showDetailedLogs && endOfBlockTrades.length > 0) {
      console.log('🟡 TRADES QUE TERMINARON EN END_OF_BLOCK:');
      endOfBlockTrades.forEach((trade, index) => {
        const pnlColor = trade.pnl >= 0 ? 'green' : 'red';
        const maxColor = trade.maxPossiblePnL >= 0 ? 'green' : 'red';
        const tpColor = 'green';
        
        const maxPrice = trade.details.maxPrice.toFixed(2);
        const minPrice = trade.details.minPrice.toFixed(2);
        
        console.log(`   ${index + 1}. ${trade.blockId} | ${trade.direction} | ${colorize('Entry', 'blue')}: $${trade.details.entryPrice} | ${colorize('Max', 'green')}: $${maxPrice} | ${colorize('Min', 'red')}: $${minPrice} | ${colorize('Exit', 'yellow')}: $${trade.details.finalPrice} | P&L: ${colorize('$' + trade.pnl.toFixed(2), pnlColor)} | Max posible: ${colorize('$' + trade.maxPossiblePnL.toFixed(2), maxColor)} | ~~TP objetivo: ${colorize('$' + trade.tpTargetPnL.toFixed(2), tpColor)}~~`);
      });
      console.log('');
    }

    // Mostrar trades que NO terminaron en END_OF_BLOCK (TAKE_PROFIT o STOP_LOSS) (solo si showDetailedLogs es true)
    if (showDetailedLogs && tpSlTrades.length > 0) {
      console.log('🟢🔴 TRADES QUE ALCANZARON TP/SL:');
      tpSlTrades.forEach((trade, index) => {
        const pnlColor = trade.pnl >= 0 ? 'green' : 'red';
        const maxColor = trade.maxPossiblePnL >= 0 ? 'green' : 'red';
        const tpColor = 'green';
        
        const maxPrice = trade.details.maxPrice.toFixed(2);
        const minPrice = trade.details.minPrice.toFixed(2);
        
        const exitIcon = trade.exitReason === 'TAKE_PROFIT' ? '🟢' : '🔴';
        
        console.log(`   ${index + 1}. ${trade.blockId} | ${trade.direction} | ${colorize('Entry', 'blue')}: $${trade.details.entryPrice} | ${colorize('Max', 'green')}: $${maxPrice} | ${colorize('Min', 'red')}: $${minPrice} | ${colorize('Exit', 'yellow')}: $${trade.details.finalPrice} | P&L: ${colorize('$' + trade.pnl.toFixed(2), pnlColor)} | Max posible: ${colorize('$' + trade.maxPossiblePnL.toFixed(2), maxColor)} | ${exitIcon} ${trade.exitReason}`);
      });
      console.log('');
    }

    // Mostrar estadísticas detalladas (solo si showDetailedLogs es true)
    if (showDetailedLogs) {
      console.log(`🎯 Take Profit alcanzado: ${tpReached} (${((tpReached/totalTrades)*100).toFixed(1)}%)`);
      console.log(`🛑 Stop Loss alcanzado: ${slReached} (${((slReached/totalTrades)*100).toFixed(1)}%)`);
      console.log(`⏰ Fin de bloque: ${endOfBlock} (${((endOfBlock/totalTrades)*100).toFixed(1)}%)`);
      console.log('');

      console.log(`🟢 Trades UP: ${upTrades.length} | P&L: $${upPnL.toFixed(2)} | Precisión: ${upAccuracy.toFixed(1)}%`);
      console.log(`🔴 Trades DOWN: ${downTrades.length} | P&L: $${downPnL.toFixed(2)} | Precisión: ${downAccuracy.toFixed(1)}%`);
      console.log('');
    }

    // Mostrar resultado según el nivel de logs
    if (showDetailedLogs) {
      console.log(`💰 TOTAL GENERAL: P&L: $${totalPnL.toFixed(2)} | Precisión: ${accuracy.toFixed(2)}%`);
      console.log('');
            } else {
              // Mostrar precisión, P&L, trades ejecutados, ganados y perdidos cuando showDetailedLogs es false
              console.log(`${accuracy.toFixed(2)} | $${totalPnL.toFixed(2)} | ${totalTrades}t | +${wonTrades} | -${lostTrades}`);
            }

    // Top 5 mejores y peores trades (solo si showDetailedLogs es true)
    if (showDetailedLogs) {
      const sortedTrades = [...trades].sort((a, b) => b.pnl - a.pnl);
      console.log(`🏆 TOP ${TOP_TRADES_COUNT} MEJORES TRADES:`);
      sortedTrades.slice(0, TOP_TRADES_COUNT).forEach((trade, index) => {
        const directionColor = trade.actualDirection === trade.direction ? 'green' : 'red';
        console.log(`${index + 1}. ${trade.blockId} | ${trade.direction} | P&L: $${trade.pnl.toFixed(2)} | ${colorize(trade.actualDirection, directionColor)}`);
      });
      console.log('');

      console.log(`💥 TOP ${TOP_TRADES_COUNT} PEORES TRADES:`);
      sortedTrades.slice(-TOP_TRADES_COUNT).reverse().forEach((trade, index) => {
        const directionColor = trade.actualDirection === trade.direction ? 'green' : 'red';
        console.log(`${index + 1}. ${trade.blockId} | ${trade.direction} | P&L: $${trade.pnl.toFixed(2)} | ${colorize(trade.actualDirection, directionColor)}`);
      });
      console.log('');
    }

    if (showDetailedLogs) {
      console.log('============================================================');
      console.log('✅ Simulación completada exitosamente');
    }

  } catch (error) {
    console.error('❌ Error en la simulación:', error);
  } finally {
    // NO desconectar la conexión - mantenerla viva para las siguientes iteraciones
    if (showDetailedLogs) {
      console.log('🔌 Manteniendo conexión MongoDB compartida');
    }
  }
}

// Exportar función para uso externo
module.exports = { runBasicSimulation };

// Ejecutar simulación
// Para logs detallados: runBasicSimulation(true)
// Para logs simples: runBasicSimulation(false)
// Con configuración personalizada: runBasicSimulation(true, { tpMultiplier: 1.5, tpMaxPercent: 0.03, slPercent: 0.01 })
runBasicSimulation(true);