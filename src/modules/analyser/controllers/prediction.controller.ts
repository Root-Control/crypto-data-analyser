import { Controller, Get, Query, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CandleAnalyser } from '../schemas/candle-analyser.schema';
import { BookService } from '../../book/book.service';
import {
  predictNextCandle,
  formatPrediction,
  getPredictionColor,
  type HistoricalCandle,
} from '../../../helpers/predictionEngine';

@Controller('prediction')
export class PredictionController {
  private readonly logger = new Logger(PredictionController.name);

  constructor(
    @InjectModel(CandleAnalyser.name)
    private candleAnalyserModel: Model<CandleAnalyser>,
    private bookService: BookService,
  ) {}

  @Get('next-candle')
  async predictNextCandle(
    @Query('pair') pair = 'ETHUSDT',
    @Query('lookback') lookback = '5',
    @Query('timeframe') timeframe = '15',
  ) {
    try {
      const lookbackMinutes = parseInt(lookback);
      const timeframeMinutes = parseInt(timeframe);

      this.logger.log(
        `🔮 Predicción para ${pair} | Lookback: ${lookbackMinutes}min | Timeframe: ${timeframeMinutes}min`,
      );

      // 1. Obtener velas históricas
      const historicalCandles = await this.getHistoricalCandles(
        pair,
        lookbackMinutes,
      );

      if (historicalCandles.length < 3) {
        return {
          success: false,
          error: `Insuficientes datos históricos: ${historicalCandles.length} velas (mínimo 3)`,
          candlesFound: historicalCandles.length,
        };
      }

      // 2. Obtener order book actual
      const currentBook = await this.bookService.getLatestSnapshot();

      if (!currentBook) {
        this.logger.warn(
          '⚠️ No hay order book disponible, usando solo momentum histórico',
        );
      }

      // 3. Ejecutar predicción
      const prediction = predictNextCandle(historicalCandles, currentBook, 3);

      // 4. Preparar respuesta
      const response = {
        success: true,
        pair,
        lookback: `${lookbackMinutes} minutos`,
        timeframe: `${timeframeMinutes} minutos`,
        timestamp: new Date().toISOString(),
        dataQuality: {
          historicalCandles: historicalCandles.length,
          hasOrderBook: !!currentBook,
          avgTickCount: this.calculateAvgTickCount(historicalCandles),
          dataCompleteness: this.calculateDataCompleteness(historicalCandles),
        },
        prediction: {
          direction: prediction.direction,
          confidence: prediction.confidence,
          expectedMove: prediction.expectedMove,
          riskLevel: prediction.riskLevel,
          color: getPredictionColor(prediction.direction),
          formatted: formatPrediction(prediction),
        },
        breakdown: {
          momentum: {
            score: prediction.breakdown.momentumScore,
            description: this.getMomentumDescription(
              prediction.breakdown.momentumScore,
            ),
          },
          orderBook: {
            score: prediction.breakdown.bookScore,
            description: this.getBookDescription(
              prediction.breakdown.bookScore,
            ),
          },
          volumeFlow: {
            score: prediction.breakdown.flowScore,
            description: this.getFlowDescription(
              prediction.breakdown.flowScore,
            ),
          },
          climax: {
            score: prediction.breakdown.climaxScore,
            description: this.getClimaxDescription(
              prediction.breakdown.climaxScore,
            ),
          },
        },
        currentMarket: currentBook
          ? {
              midPrice: currentBook.midPrice,
              spread: currentBook.spread,
              spreadPct: currentBook.spreadPct,
              bidAskImbalance: currentBook.imbalance,
              totalBidQty: currentBook.totalBidQty,
              totalAskQty: currentBook.totalAskQty,
              liquidityLevel: this.calculateLiquidityLevel(currentBook),
            }
          : null,
        historicalSummary: this.generateHistoricalSummary(historicalCandles),
      };

      this.logger.log(
        `✅ Predicción generada: ${prediction.direction} (${prediction.confidence.toFixed(1)}% confianza)`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `❌ Error en predicción: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('live-prediction')
  async getLivePrediction(@Query('pair') pair = 'ETHUSDT') {
    try {
      // Predicción en tiempo real con datos más recientes
      const historicalCandles = await this.getHistoricalCandles(pair, 10); // Últimos 10 minutos
      const currentBook = await this.bookService.getLatestSnapshot();

      if (historicalCandles.length < 3) {
        return {
          success: false,
          error: 'Insuficientes datos para predicción en vivo',
          candlesAvailable: historicalCandles.length,
        };
      }

      const prediction = predictNextCandle(historicalCandles, currentBook, 3);

      return {
        success: true,
        timestamp: new Date().toISOString(),
        pair,
        prediction: {
          direction: prediction.direction,
          confidence: Math.round(prediction.confidence),
          expectedMove: prediction.expectedMove.toFixed(3),
          riskLevel: prediction.riskLevel,
          color: getPredictionColor(prediction.direction),
        },
        market: currentBook
          ? {
              price: currentBook.midPrice,
              spread: currentBook.spreadPct,
              imbalance: currentBook.imbalance,
            }
          : null,
      };
    } catch (error) {
      this.logger.error(`❌ Error en predicción en vivo: ${error.message}`);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ============================================================================
  // MÉTODOS PRIVADOS
  // ============================================================================

  private async getHistoricalCandles(
    pair: string,
    lookbackMinutes: number,
  ): Promise<HistoricalCandle[]> {
    // Obtener bloques de los últimos N minutos
    const now = new Date();
    const lookbackMs = lookbackMinutes * 60 * 1000;
    const startTime = new Date(now.getTime() - lookbackMs);

    // Buscar bloques que contengan datos de los últimos N minutos
    const blocks = await this.candleAnalyserModel
      .find({
        pair,
        status: 'completed',
      })
      .sort({ startDate: -1, startTime: -1 })
      .limit(5) // Últimos 5 bloques
      .exec();

    const candles: HistoricalCandle[] = [];

    for (const block of blocks) {
      for (const analysis of block.analysis) {
        // Convertir minute string a timestamp para filtrar
        const [hours, minutes] = analysis.minute.split(':').map(Number);
        const candleTime = new Date(
          block.startDate + 'T' + analysis.minute + ':00Z',
        );

        if (candleTime >= startTime) {
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
    }

    // Ordenar por tiempo (más antiguo primero)
    return candles.sort((a, b) => {
      const timeA = new Date('2025-01-01T' + a.minute + ':00Z').getTime();
      const timeB = new Date('2025-01-01T' + b.minute + ':00Z').getTime();
      return timeA - timeB;
    });
  }

  private calculateAvgTickCount(candles: HistoricalCandle[]): number {
    const tickCounts = candles
      .map((c) => c.tickCount || 0)
      .filter((tc) => tc > 0);
    if (tickCounts.length === 0) return 0;
    return tickCounts.reduce((a, b) => a + b, 0) / tickCounts.length;
  }

  private calculateDataCompleteness(candles: HistoricalCandle[]): number {
    let completeFields = 0;
    let totalFields = 0;

    for (const candle of candles) {
      const fields = [
        'tickVol',
        'buyVol',
        'sellVol',
        'imbalance',
        'vwap',
        'flags',
      ];
      totalFields += fields.length;

      for (const field of fields) {
        if (candle[field] !== undefined && candle[field] !== null) {
          completeFields++;
        }
      }
    }

    return totalFields > 0 ? (completeFields / totalFields) * 100 : 0;
  }

  private calculateLiquidityLevel(book: any): string {
    if (!book.totalBidQty || !book.totalAskQty) return 'UNKNOWN';

    const totalLiquidity = book.totalBidQty + book.totalAskQty;

    if (totalLiquidity >= 100) return 'HIGH';
    if (totalLiquidity >= 10) return 'MEDIUM';
    return 'LOW';
  }

  private generateHistoricalSummary(candles: HistoricalCandle[]): any {
    if (candles.length === 0) return null;

    const prices = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.tickVol || 0);
    const imbalances = candles.map((c) => c.imbalance || 0);

    return {
      priceRange: {
        min: Math.min(...prices),
        max: Math.max(...prices),
        change:
          (((prices[prices.length - 1] - prices[0]) / prices[0]) * 100).toFixed(
            2,
          ) + '%',
      },
      volumeStats: {
        avg: (volumes.reduce((a, b) => a + b, 0) / volumes.length).toFixed(2),
        max: Math.max(...volumes).toFixed(2),
        trend: this.calculateTrend(volumes),
      },
      imbalanceStats: {
        avg: (
          imbalances.reduce((a, b) => a + b, 0) / imbalances.length
        ).toFixed(3),
        trend: this.calculateTrend(imbalances),
        bullish: candles.filter((c) => c.flags?.bullish).length,
        bearish: candles.filter((c) => c.flags?.bearish).length,
        climax: candles.filter((c) => c.flags?.climax).length,
      },
    };
  }

  private calculateTrend(values: number[]): string {
    if (values.length < 2) return 'STABLE';

    const first = values[0];
    const last = values[values.length - 1];
    const change = (last - first) / first;

    if (change > 0.1) return 'INCREASING';
    if (change < -0.1) return 'DECREASING';
    return 'STABLE';
  }

  private getMomentumDescription(score: number): string {
    if (score > 50) return 'Fuerte momentum alcista';
    if (score > 20) return 'Momentum alcista moderado';
    if (score > -20) return 'Momentum neutral';
    if (score > -50) return 'Momentum bajista moderado';
    return 'Fuerte momentum bajista';
  }

  private getBookDescription(score: number): string {
    if (score > 50) return 'Presión de compra en order book';
    if (score > 20) return 'Ligera presión de compra';
    if (score > -20) return 'Order book equilibrado';
    if (score > -50) return 'Ligera presión de venta';
    return 'Fuerte presión de venta en order book';
  }

  private getFlowDescription(score: number): string {
    if (score > 50) return 'Flujo de volumen alcista';
    if (score > 20) return 'Flujo de volumen positivo';
    if (score > -20) return 'Flujo de volumen neutral';
    if (score > -50) return 'Flujo de volumen negativo';
    return 'Flujo de volumen bajista';
  }

  private getClimaxDescription(score: number): string {
    if (score > 50) return 'Alta presión de climax alcista';
    if (score > 20) return 'Presión de climax positiva';
    if (score > -20) return 'Sin presión de climax significativa';
    if (score > -50) return 'Presión de climax negativa';
    return 'Alta presión de climax bajista';
  }
}
