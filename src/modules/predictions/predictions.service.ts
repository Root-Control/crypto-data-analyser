import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../../third-party-services/redis/redis.service';
import { CandleAnalyser } from '../analyser/schemas/candle-analyser.schema';
import { refinedPrediction } from '../../algorithms/refined-prediction';
import { HistoricalCandle } from '../../helpers/predictionEngine';
import { BinanceService } from '../../third-party-services/binance/binance.service';
import { softRefined } from '../../algorithms';

@Injectable()
export class PredictionsService implements OnModuleInit {
  private readonly logger = new Logger(PredictionsService.name);
  private readonly PAIR = 'ETHUSDT';

  constructor(
    private readonly redisService: RedisService,
    @InjectModel(CandleAnalyser.name)
    private readonly candleAnalyserModel: Model<CandleAnalyser>,
    private readonly binanceService: BinanceService,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 Initializing Predictions Service...');
    this.subscribeToAnalysisTopic();
    this.logger.log('⏰ Cron jobs initialized - will run every 4 minutes');
  }

  // ============================================================================
  // CRON JOBS
  // ============================================================================

  @Cron('0 */4 * * * *') // Cada 4 minutos: 0, 4, 8, 12, 16, 20, etc.
  async handleCronJob() {
    this.logger.log('⏰ Cron job triggered - fetching candles...');
    await this.fetchAndStoreCandles();
  }

  // ============================================================================
  // CANDLE MANAGEMENT
  // ============================================================================

  private async fetchAndStoreCandles() {
    try {
      // 1. Obtener todos los candles completados
      const candles = await this.candleAnalyserModel
        .find({
          pair: this.PAIR,
          status: 'completed',
        })
        .sort({ startDate: -1, startTime: -1 })
        .limit(100) // Últimos 100 bloques
        .exec();

      this.logger.log(`📊 Found ${candles.length} completed candle blocks`);

      // 2. Sanitizar y convertir a HistoricalCandle[]
      const historicalCandles: HistoricalCandle[] = [];

      for (const block of candles) {
        for (const analysis of block.analysis) {
          historicalCandles.push({
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

      // 2.1. Los datos ya vienen ordenados desde la BD, no necesitan sanitización

      // 3. Calcular next candle time (último + 15 minutos)
      let nextCandleTime: string;
      if (candles.length > 0) {
        // Usar el último bloque real de la BD (startTime ya es múltiplo de 15 min)
        const lastBlock = candles[0]; // Ya están ordenados por fecha descendente

        this.logger.log(
          `🔍 Last block: ${lastBlock.startDate} ${lastBlock.startTime}`,
        );

        // Construir fecha real del último bloque usando startDate y startTime
        const lastTime = new Date(
          `${lastBlock.startDate}T${lastBlock.startTime}:00Z`,
        );
        const nextTime = new Date(lastTime.getTime() + 15 * 60 * 1000); // +15 minutos
        nextCandleTime = nextTime.toISOString();

        this.logger.log(`🔍 Calculated next: ${nextCandleTime}`);
      } else {
        // Si no hay candles, usar tiempo actual
        nextCandleTime = new Date().toISOString();
      }

      // 4. Guardar en Redis
      const redisData = {
        candles: historicalCandles,
        next: nextCandleTime,
        lastUpdate: new Date().toISOString(),
      };

      await this.redisService.set(
        `LAST_CANDLES_${this.PAIR}`,
        JSON.stringify(redisData),
      );

      this.logger.log(`✅ Stored ${historicalCandles.length} candles in Redis`);
      this.logger.log(`   Next candle time: ${nextCandleTime}`);
    } catch (error) {
      this.logger.error(`❌ Error fetching and storing candles:`, error);
    }
  }

  private async subscribeToAnalysisTopic() {
    try {
      // Obtener el tópico desde .env o usar default
      const topicPrefix =
        process.env.READY_FOR_ANALYSIS_PREFIX_TOPIC || 'READY_FOR_ANALYSIS';
      const topic = `${topicPrefix}_${this.PAIR}`;

      this.logger.log(`📡 Subscribing to Redis topic: ${topic}`);

      // Suscribirse al tópico
      await this.redisService.subscribe(topic, (message) => {
        this.handleAnalysisMessage(message, topic);
      });

      this.logger.log(`✅ Successfully subscribed to topic: ${topic}`);
    } catch (error) {
      this.logger.error(
        `❌ Error subscribing to analysis topic: ${error.message}`,
      );
    }
  }

  private async handleAnalysisMessage(message: string, topic: string) {
    try {
      this.logger.log(`📨 Received message on topic ${topic}:`);
      this.logger.log(`   Message: ${message}`);

      // Parsear el mensaje si es JSON
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(message);
        this.logger.log(`   Parsed data:`, parsedMessage);
      } catch {
        this.logger.log(`   Raw message (not JSON): ${message}`);
      }

      // Si es un ping de vela culminada, hacer predicción
      if (
        message === 'PING' ||
        (parsedMessage && parsedMessage.type === 'candle_completed') ||
        (parsedMessage && parsedMessage.type === 'block_completed')
      ) {
        this.logger.log(
          '🔔 Block completion ping received - making prediction...',
        );
        await this.handleCandleCompletion(parsedMessage);
      }

      this.logger.log(`✅ Message processed successfully`);
    } catch (error) {
      this.logger.error(`❌ Error processing message: ${error.message}`);
    }
  }

  // ============================================================================
  // PREDICTION HANDLING
  // ============================================================================

  private async handleCandleCompletion(blockData?: any) {
    try {
      // 1. Obtener datos de Redis
      const redisDataStr = await this.redisService.get(
        `LAST_CANDLES_${this.PAIR}`,
      );
      if (!redisDataStr) {
        this.logger.warn('⚠️ No candle data found in Redis');
        return;
      }

      const redisData = JSON.parse(redisDataStr);
      const { candles, next } = redisData;

      this.logger.log(`📊 Retrieved ${candles.length} candles from Redis`);
      this.logger.log(`   Next candle time: ${next}`);

      // 2. Buscar la nueva vela usando datos del mensaje o next timestamp de Redis
      let searchDate: string;
      let searchTime: string;

      if (blockData && blockData.startDate && blockData.startTime) {
        // Usar datos del mensaje
        searchDate = blockData.startDate;
        searchTime = blockData.startTime;
        this.logger.log(`🔍 Using message data: ${searchDate} ${searchTime}`);
      } else {
        // Usar next timestamp de Redis
        const nextTime = new Date(next);
        searchDate = nextTime.toISOString().split('T')[0]; // YYYY-MM-DD
        searchTime = nextTime.toISOString().split('T')[1].substring(0, 5); // HH:MM
        this.logger.log(`🔍 Using Redis next: ${searchDate} ${searchTime}`);
      }

      this.logger.log(`🔍 Looking for new candle: ${searchDate} ${searchTime}`);

      const newCandle = await this.candleAnalyserModel
        .findOne({
          pair: this.PAIR,
          startDate: searchDate,
          startTime: searchTime,
          status: 'completed',
        })
        .exec();

      if (!newCandle) {
        this.logger.warn(
          `⚠️ New candle not found: ${searchDate} ${searchTime}`,
        );
        return;
      }

      this.logger.log(`✅ Found new candle: ${searchDate} ${searchTime}`);

      // 4. Convertir nueva vela a HistoricalCandle
      const newHistoricalCandles: HistoricalCandle[] = [];
      for (const analysis of newCandle.analysis) {
        newHistoricalCandles.push({
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

      // 5. Combinar con candles existentes
      const allCandles = [...candles, ...newHistoricalCandles];

      // 6. Obtener book actual desde Redis
      this.logger.log('📖 Getting current book from Redis...');
      const currentBookStr = await this.redisService.get('book:ETHUSDT');
      let currentBook = null;

      if (currentBookStr) {
        try {
          currentBook = JSON.parse(currentBookStr);
          this.logger.log('✅ Current book retrieved successfully');
        } catch (error) {
          this.logger.warn(
            '⚠️ Failed to parse current book from Redis:',
            error,
          );
        }
      } else {
        this.logger.warn('⚠️ No current book found in Redis');
      }

      // 7. Hacer predicción usando refined-prediction
      this.logger.log('🎯 Making prediction with refined algorithm...');
      const prediction = refinedPrediction(allCandles, currentBook, 3);

      // 7.1. Hacer predicción2 usando soft-refined algorithm
      this.logger.log('🎯 Making prediction2 with soft-refined algorithm...');
      const prediction2 = softRefined(allCandles, currentBook, 3);

      // 8. Calcular setup de trading para ambas predicciones
      const tradingSetup = this.calculateTradingSetup(
        newCandle,
        prediction,
        15, // Capital fijo
        10, // Leverage fijo
      );

      const tradingSetup2 = this.calculateTradingSetup(
        newCandle,
        prediction2,
        15, // Capital fijo
        10, // Leverage fijo
      );

      // 9. Loggear resultados de ambas predicciones
      this.logger.log('📈 PREDICTION 1 (Refined Algorithm):');
      this.logger.log(`   Direction: ${prediction.direction}`);
      this.logger.log(`   Confidence: ${prediction.confidence}`);
      this.logger.log(`   Risk Level: ${prediction.riskLevel}`);
      this.logger.log(`   Expected Move: ${prediction.expectedMove}%`);

      this.logger.log('📈 PREDICTION 2 (Soft-Refined Algorithm):');
      this.logger.log(`   Direction: ${prediction2.direction}`);
      this.logger.log(`   Confidence: ${prediction2.confidence}`);
      this.logger.log(`   Risk Level: ${prediction2.riskLevel}`);
      this.logger.log(`   Expected Move: ${prediction2.expectedMove}%`);

      // Análisis de convergencia entre predicciones
      const directionMatch = prediction.direction === prediction2.direction;
      const confidenceDiff = Math.abs(
        prediction.confidence - prediction2.confidence,
      );
      const expectedMoveDiff = Math.abs(
        prediction.expectedMove - prediction2.expectedMove,
      );

      this.logger.log('🔍 PREDICTION ANALYSIS:');
      this.logger.log(
        `   Direction Match: ${directionMatch ? '✅ YES' : '❌ NO'}`,
      );
      this.logger.log(
        `   Confidence Difference: ${confidenceDiff.toFixed(2)}%`,
      );
      this.logger.log(
        `   Expected Move Difference: ${expectedMoveDiff.toFixed(2)}%`,
      );

      // Hacer trades individuales para cada predicción
      this.logger.log('🎯 EXECUTING INDIVIDUAL TRADES FOR BOTH PREDICTIONS');

      // Trade para Predicción 1
      if (tradingSetup.direction !== 'SIDEWAYS') {
        this.logger.log('💰 TRADING SETUP 1 (Refined):');
        this.logger.log(
          `   Entry Price: $${tradingSetup.entryPrice.toFixed(2)}`,
        );
        this.logger.log(
          `   Take Profit: $${tradingSetup.takeProfitPrice.toFixed(2)} (${tradingSetup.takeProfitPercent.toFixed(2)}%)`,
        );
        this.logger.log(
          `   Stop Loss: $${tradingSetup.stopLossPrice.toFixed(2)} (${tradingSetup.stopLossPercent.toFixed(2)}%)`,
        );
        this.logger.log(
          `   Position Size: ${tradingSetup.positionSize.toFixed(4)} ETH`,
        );
        this.logger.log(
          `   Capital: $${tradingSetup.capital} | Leverage: ${tradingSetup.leverage}x`,
        );

        // Ejecutar trade 1
        this.logger.log('🤖 Executing trade 1 (Refined)...');
        const tradeResult1 = await this.binanceService.executeTrade({
          ...tradingSetup,
          symbol: this.PAIR,
        });

        if (tradeResult1.success) {
          this.logger.log(
            `✅ Trade 1 executed successfully! Order ID: ${tradeResult1.orderId}`,
          );
        } else {
          this.logger.warn(
            `⚠️ Trade 1 execution failed: ${tradeResult1.message}`,
          );
        }
      } else {
        this.logger.log('🚫 NO TRADE 1 - SIDEWAYS signal from prediction 1');
      }

      // Trade para Predicción 2
      if (tradingSetup2.direction !== 'SIDEWAYS') {
        this.logger.log('💰 TRADING SETUP 2 (Soft-Refined):');
        this.logger.log(
          `   Entry Price: $${tradingSetup2.entryPrice.toFixed(2)}`,
        );
        this.logger.log(
          `   Take Profit: $${tradingSetup2.takeProfitPrice.toFixed(2)} (${tradingSetup2.takeProfitPercent.toFixed(2)}%)`,
        );
        this.logger.log(
          `   Stop Loss: $${tradingSetup2.stopLossPrice.toFixed(2)} (${tradingSetup2.stopLossPercent.toFixed(2)}%)`,
        );
        this.logger.log(
          `   Position Size: ${tradingSetup2.positionSize.toFixed(4)} ETH`,
        );
        this.logger.log(
          `   Capital: $${tradingSetup2.capital} | Leverage: ${tradingSetup2.leverage}x`,
        );

        // Ejecutar trade 2
        this.logger.log('🤖 Executing trade 2 (Soft-Refined)...');
        const tradeResult2 = await this.binanceService.executeTrade({
          ...tradingSetup2,
          symbol: this.PAIR,
        });

        if (tradeResult2.success) {
          this.logger.log(
            `✅ Trade 2 executed successfully! Order ID: ${tradeResult2.orderId}`,
          );
        } else {
          this.logger.warn(
            `⚠️ Trade 2 execution failed: ${tradeResult2.message}`,
          );
        }
      } else {
        this.logger.log('🚫 NO TRADE 2 - SIDEWAYS signal from prediction 2');
      }

      if (prediction.analysis) {
        this.logger.log(`   Prediction 1 Analysis:`, prediction.analysis);
      }

      if (prediction2.breakdown) {
        this.logger.log(`   Prediction 2 Breakdown:`, prediction2.breakdown);
      }

      // 9. Actualizar Redis con la nueva vela
      // Calcular siguiente vela basado en la vela encontrada + 15 minutos
      const currentTime = new Date(`${searchDate}T${searchTime}:00Z`);
      const nextCandleTime = new Date(currentTime.getTime() + 15 * 60 * 1000); // +15 minutos

      const updatedRedisData = {
        candles: allCandles,
        next: nextCandleTime.toISOString(),
        lastUpdate: new Date().toISOString(),
        lastPrediction: {
          timestamp: new Date().toISOString(),
          direction: prediction.direction,
          confidence: prediction.confidence,
          expectedMove: prediction.expectedMove,
          riskLevel: prediction.riskLevel,
        },
        lastPrediction2: {
          timestamp: new Date().toISOString(),
          direction: prediction2.direction,
          confidence: prediction2.confidence,
          expectedMove: prediction2.expectedMove,
          riskLevel: prediction2.riskLevel,
          breakdown: prediction2.breakdown,
        },
        predictionAnalysis: {
          directionMatch,
          confidenceDiff,
          expectedMoveDiff,
        },
        lastTrading1: {
          entryPrice: tradingSetup.entryPrice,
          takeProfitPrice: tradingSetup.takeProfitPrice,
          stopLossPrice: tradingSetup.stopLossPrice,
          positionSize: tradingSetup.positionSize,
          leverage: tradingSetup.leverage,
          capital: tradingSetup.capital,
          takeProfitPercent: tradingSetup.takeProfitPercent,
          stopLossPercent: tradingSetup.stopLossPercent,
          direction: tradingSetup.direction,
          algorithm: 'refined',
        },
        lastTrading2: {
          entryPrice: tradingSetup2.entryPrice,
          takeProfitPrice: tradingSetup2.takeProfitPrice,
          stopLossPrice: tradingSetup2.stopLossPrice,
          positionSize: tradingSetup2.positionSize,
          leverage: tradingSetup2.leverage,
          capital: tradingSetup2.capital,
          takeProfitPercent: tradingSetup2.takeProfitPercent,
          stopLossPercent: tradingSetup2.stopLossPercent,
          direction: tradingSetup2.direction,
          algorithm: 'soft-refined',
        },
      };

      await this.redisService.set(
        `LAST_CANDLES_${this.PAIR}`,
        JSON.stringify(updatedRedisData),
      );

      this.logger.log('✅ Prediction completed and data updated in Redis');
    } catch (error) {
      this.logger.error(`❌ Error handling candle completion:`, error);
    }
  }

  // ============================================================================
  // TRADING CALCULATION METHODS
  // ============================================================================

  private calculateTradingSetup(
    currentBlock: any,
    prediction: any,
    capital: number,
    leverage: number,
  ): any {
    // Precio de entrada: último precio conocido del bloque actual
    const entryPrice =
      currentBlock.analysis[currentBlock.analysis.length - 1].close;

    // Calcular TAKE PROFIT y STOP LOSS
    const expectedMovePercent = prediction.expectedMove / 100;
    const takeProfitPercent = Math.min(expectedMovePercent * 1.2, 0.025); // 120% del expectedMove, max 2.5%
    const stopLossPercent = 0.008; // 0.8% Stop Loss

    let takeProfitPrice = 0;
    let stopLossPrice = 0;
    let positionSize = 0;

    if (prediction.direction === 'UP') {
      // Long position
      takeProfitPrice = entryPrice * (1 + takeProfitPercent);
      stopLossPrice = entryPrice * (1 - stopLossPercent);
      positionSize = (capital * leverage) / entryPrice;
    } else if (prediction.direction === 'DOWN') {
      // Short position
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

  // ============================================================================
  // DEBUG/UTILITY METHODS
  // ============================================================================

  async getRedisData() {
    try {
      const redisDataStr = await this.redisService.get(
        `LAST_CANDLES_${this.PAIR}`,
      );
      if (!redisDataStr) {
        return { error: 'No data found in Redis' };
      }
      return JSON.parse(redisDataStr);
    } catch (error) {
      return { error: error.message };
    }
  }

  async triggerCronManually() {
    this.logger.log('🔧 Manual cron trigger...');
    await this.fetchAndStoreCandles();
  }

  async triggerPredictionManually() {
    this.logger.log('🔧 Manual prediction trigger...');
    await this.handleCandleCompletion();
  }

  async getBinanceBalance() {
    return this.binanceService.getAccountBalance();
  }
}
