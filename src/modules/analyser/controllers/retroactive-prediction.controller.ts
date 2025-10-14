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

interface ValidationResult {
  validBlocks: CandleAnalyser[];
  removedBlocks: {
    index: number;
    reason: string;
    blockId: string;
  }[];
}

interface PredictionResult {
  index: number;
  prediction: {
    direction: 'UP' | 'DOWN' | 'SIDEWAYS';
    confidence: number;
    expectedMove: number;
    riskLevel: 'LOW' | 'MED' | 'HIGH';
  };
  targetBlock: {
    exists: boolean;
    actualDirection?: 'UP' | 'DOWN' | 'SIDEWAYS';
    actualMove?: number;
  };
  trading: {
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
    leverage: number;
    capital: number;
  } | null;
}

interface RetroactiveAnalysis {
  totalBlocks: number;
  validBlocks: number;
  predictions: PredictionResult[];
  summary: {
    totalPredictions: number;
    correctPredictions: number;
    accuracy: number;
    totalPnL: number;
    totalPnLPercent: number;
    bestPrediction: PredictionResult | null;
    worstPrediction: PredictionResult | null;
  };
}

@Controller('retroactive-prediction')
export class RetroactivePredictionController {
  private readonly logger = new Logger(RetroactivePredictionController.name);

  constructor(
    @InjectModel(CandleAnalyser.name)
    private candleAnalyserModel: Model<CandleAnalyser>,
    private bookService: BookService,
  ) {}

  @Get('analyze')
  async analyzeRetroactive(
    @Query('pair') pair = 'ETHUSDT',
    @Query('capital') capital = '400',
    @Query('leverage') leverage = '10',
  ) {
    try {
      const capitalAmount = parseFloat(capital);
      const leverageAmount = parseFloat(leverage);

      this.logger.log(
        `🔮 Análisis retroactivo para ${pair} | Capital: $${capitalAmount} | Leverage: ${leverageAmount}x`,
      );

      // PASO 1: Obtener todos los bloques ordenados
      const allBlocks = await this.getAllBlocksSorted(pair);
      this.logger.log(`📊 Encontrados ${allBlocks.length} bloques totales`);

      if (allBlocks.length < 3) {
        return {
          success: false,
          error: `Insuficientes bloques: ${allBlocks.length} (mínimo 3)`,
          blocksFound: allBlocks.length,
        };
      }

      // PASO 2: Validar y limpiar bloques
      const validation = this.validateAndCleanBlocks(allBlocks);
      this.logger.log(
        `✅ Bloques válidos: ${validation.validBlocks.length} | Eliminados: ${validation.removedBlocks.length}`,
      );

      if (validation.validBlocks.length < 3) {
        return {
          success: false,
          error: `Insuficientes bloques válidos: ${validation.validBlocks.length} (mínimo 3)`,
          validation,
        };
      }

      // PASO 3: Ejecutar análisis retroactivo
      const analysis = await this.executeRetroactiveAnalysis(
        validation.validBlocks,
        capitalAmount,
        leverageAmount,
      );

      // PASO 4: Preparar respuesta con grupos y predicciones
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-GB', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });

      const response = {
        success: true,
        pair,
        timestamp: now.toISOString(),
        temporalidad: currentTime,
        parameters: {
          capital: capitalAmount,
          leverage: leverageAmount,
        },
        validation: {
          validBlocksQty: validation.validBlocks.length,
          removedBlocksQty: validation.removedBlocks.length,
        },
        grupos: validation.validBlocks.map((block, index) => {
          // Buscar predicción para este grupo (si existe)
          const prediction = analysis.predictions.find(
            (p) => p.index === index,
          );

          return {
            indice: index,
            bloqueId: `${block.startDate}_${block.startTime}`,
            fecha: block.startDate,
            hora: block.startTime,
            status: block.status,
            analysisCount: block.analysis.length,
            nextCandlePrediction: prediction
              ? {
                  direccion: prediction.prediction.direction,
                  confianza:
                    Math.round(prediction.prediction.confidence * 100) / 100,
                  movimientoEsperado:
                    Math.round(prediction.prediction.expectedMove * 10000) /
                    10000,
                  riesgo: prediction.prediction.riskLevel,
                  targetBlock: validation.validBlocks[index + 1]
                    ? {
                        bloqueId: `${validation.validBlocks[index + 1].startDate}_${validation.validBlocks[index + 1].startTime}`,
                        fecha: validation.validBlocks[index + 1].startDate,
                        hora: validation.validBlocks[index + 1].startTime,
                      }
                    : null,
                }
              : null,
            resultado: prediction?.targetBlock.exists
              ? {
                  direccionReal: prediction.targetBlock.actualDirection,
                  movimientoReal:
                    Math.round(prediction.targetBlock.actualMove * 10000) /
                    10000,
                  correcto:
                    prediction.prediction.direction ===
                    prediction.targetBlock.actualDirection,
                }
              : prediction
                ? { existe: false }
                : null,
            trading: prediction?.trading
              ? {
                  entryPrice:
                    Math.round(prediction.trading.entryPrice * 100) / 100,
                  exitPrice:
                    Math.round(prediction.trading.exitPrice * 100) / 100,
                  pnl: Math.round(prediction.trading.pnl * 100) / 100,
                  pnlPercent:
                    Math.round(prediction.trading.pnlPercent * 100) / 100,
                }
              : null,
            puedePredecir: index >= 2, // Solo grupos 2+ pueden tener predicción
          };
        }),
        resumen: {
          totalPredictions: analysis.summary.totalPredictions,
          correctPredictions: analysis.summary.correctPredictions,
          accuracy: Math.round(analysis.summary.accuracy * 100) / 100,
          totalPnL: Math.round(analysis.summary.totalPnL * 100) / 100,
          totalPnLPercent:
            Math.round(analysis.summary.totalPnLPercent * 100) / 100,
        },
        insights: this.generateInsights(analysis),
      };

      this.logger.log(
        `✅ Análisis completado: ${analysis.summary.correctPredictions}/${analysis.summary.totalPredictions} correctas (${analysis.summary.accuracy.toFixed(1)}%)`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `❌ Error en análisis retroactivo: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('quick-analysis')
  async quickAnalysis(@Query('pair') pair = 'ETHUSDT') {
    try {
      const allBlocks = await this.getAllBlocksSorted(pair);

      if (allBlocks.length < 3) {
        return {
          success: false,
          error: `Insuficientes bloques: ${allBlocks.length}`,
          blocksFound: allBlocks.length,
        };
      }

      const validation = this.validateAndCleanBlocks(allBlocks);

      if (validation.validBlocks.length < 3) {
        return {
          success: false,
          error: `Insuficientes bloques válidos: ${validation.validBlocks.length}`,
        };
      }

      // Análisis rápido: solo las últimas 5 predicciones
      const recentBlocks = validation.validBlocks.slice(-8); // Últimos 8 para tener 5 predicciones
      const quickAnalysis = await this.executeRetroactiveAnalysis(
        recentBlocks,
        400,
        10,
      );

      return {
        success: true,
        pair,
        timestamp: new Date().toISOString(),
        totalBlocks: allBlocks.length,
        validBlocks: validation.validBlocks.length,
        recentAnalysis: {
          totalPredictions: quickAnalysis.summary.totalPredictions,
          correctPredictions: quickAnalysis.summary.correctPredictions,
          accuracy: Math.round(quickAnalysis.summary.accuracy * 100) / 100,
          totalPnL: Math.round(quickAnalysis.summary.totalPnL * 100) / 100,
          totalPnLPercent:
            Math.round(quickAnalysis.summary.totalPnLPercent * 100) / 100,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Error en análisis rápido: ${error.message}`);
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

  private async getAllBlocksSorted(pair: string): Promise<CandleAnalyser[]> {
    return await this.candleAnalyserModel
      .find({ pair })
      .sort({ startDate: 1, startTime: 1 }) // Ordenar por fecha/hora ascendente
      .exec();
  }

  private validateAndCleanBlocks(
    allBlocks: CandleAnalyser[],
  ): ValidationResult {
    const validBlocks: CandleAnalyser[] = [];
    const removedBlocks: { index: number; reason: string; blockId: string }[] =
      [];

    for (let i = 0; i < allBlocks.length; i++) {
      const block = allBlocks[i];
      const blockId = `${block.startDate}_${block.startTime}`;

      // Verificar que tenga exactamente 15 análisis
      if (!block.analysis || block.analysis.length !== 15) {
        removedBlocks.push({
          index: i,
          reason: `Análisis incompletos: ${block.analysis?.length || 0}/15`,
          blockId,
        });

        // Lógica de eliminación inteligente
        if (this.shouldRemoveSubsequentBlocks(i, allBlocks.length)) {
          // Eliminar todos los bloques posteriores
          const subsequentRemoved = allBlocks.slice(i + 1).map((b, idx) => ({
            index: i + 1 + idx,
            reason: 'Eliminado por bloque incompleto anterior',
            blockId: `${b.startDate}_${b.startTime}`,
          }));
          removedBlocks.push(...subsequentRemoved);
          break; // Salir del loop
        }
        continue;
      }

      // Verificar que todos los análisis tengan datos mínimos
      const hasMinimumData = this.validateAnalysisData(block.analysis);
      if (!hasMinimumData) {
        removedBlocks.push({
          index: i,
          reason: 'Datos insuficientes en análisis',
          blockId,
        });

        if (this.shouldRemoveSubsequentBlocks(i, allBlocks.length)) {
          const subsequentRemoved = allBlocks.slice(i + 1).map((b, idx) => ({
            index: i + 1 + idx,
            reason: 'Eliminado por datos insuficientes anterior',
            blockId: `${b.startDate}_${b.startTime}`,
          }));
          removedBlocks.push(...subsequentRemoved);
          break;
        }
        continue;
      }

      validBlocks.push(block);
    }

    return { validBlocks, removedBlocks };
  }

  private shouldRemoveSubsequentBlocks(
    currentIndex: number,
    totalBlocks: number,
  ): boolean {
    // Si es el último bloque, no eliminar posteriores
    if (currentIndex === totalBlocks - 1) return false;

    // Si es el primero, solo eliminar si hay muchos bloques
    if (currentIndex === 0) return totalBlocks > 10;

    // Si está en el centro, eliminar posteriores para mantener continuidad
    return true;
  }

  private validateAnalysisData(analysis: any[]): boolean {
    if (!analysis || analysis.length !== 15) return false;

    // Verificar que al menos el 80% de los análisis tengan datos esenciales
    let validAnalyses = 0;

    for (const item of analysis) {
      if (
        item &&
        typeof item.open === 'number' &&
        typeof item.close === 'number' &&
        typeof item.high === 'number' &&
        typeof item.low === 'number'
      ) {
        validAnalyses++;
      }
    }

    return validAnalyses / 15 >= 0.8; // Al menos 12/15 análisis válidos
  }

  private async executeRetroactiveAnalysis(
    validBlocks: CandleAnalyser[],
    capital: number,
    leverage: number,
  ): Promise<RetroactiveAnalysis> {
    const predictions: PredictionResult[] = [];

    // Iterar desde el índice 2 hasta N-1
    for (let i = 2; i < validBlocks.length; i++) {
      const currentBlock = validBlocks[i];
      const historicalBlocks = validBlocks.slice(0, i); // Bloques anteriores
      const nextBlock = validBlocks[i + 1]; // Bloque siguiente (si existe)

      try {
        // Convertir bloques históricos a formato HistoricalCandle
        const historicalCandles =
          this.convertBlocksToHistoricalCandles(historicalBlocks);

        // Obtener order book del bloque actual (si está disponible)
        const currentBook =
          currentBlock.analysis[currentBlock.analysis.length - 1]?.book || null;

        // Ejecutar predicción
        const prediction = predictNextCandle(historicalCandles, currentBook, 3);

        // Verificar si existe el bloque siguiente
        const targetBlock = nextBlock
          ? {
              exists: true,
              actualDirection: this.calculateActualDirection(nextBlock),
              actualMove: this.calculateActualMove(nextBlock),
            }
          : {
              exists: false,
            };

        // Calcular PnL si existe el bloque siguiente
        let trading = null;
        if (targetBlock.exists && nextBlock) {
          trading = this.calculateTradingPnL(
            currentBlock,
            nextBlock,
            prediction,
            capital,
            leverage,
          );
        }

        predictions.push({
          index: i,
          prediction: {
            direction: prediction.direction,
            confidence: prediction.confidence,
            expectedMove: prediction.expectedMove,
            riskLevel: prediction.riskLevel,
          },
          targetBlock,
          trading,
        });
      } catch (error) {
        this.logger.warn(`⚠️ Error procesando bloque ${i}: ${error.message}`);
        continue;
      }
    }

    // Calcular resumen
    const summary = this.calculateSummary(predictions);

    return {
      totalBlocks: validBlocks.length,
      validBlocks: validBlocks.length,
      predictions,
      summary,
    };
  }

  private convertBlocksToHistoricalCandles(
    blocks: CandleAnalyser[],
  ): HistoricalCandle[] {
    const candles: HistoricalCandle[] = [];

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

  private calculateActualDirection(
    block: CandleAnalyser,
  ): 'UP' | 'DOWN' | 'SIDEWAYS' {
    if (block.analysis.length === 0) return 'SIDEWAYS';

    const firstCandle = block.analysis[0];
    const lastCandle = block.analysis[block.analysis.length - 1];

    const change = (lastCandle.close - firstCandle.open) / firstCandle.open;

    if (change > 0.002) return 'UP'; // Bajado de 0.5% a 0.2%
    if (change < -0.002) return 'DOWN'; // Bajado de -0.5% a -0.2%
    return 'SIDEWAYS';
  }

  private calculateActualMove(block: CandleAnalyser): number {
    if (block.analysis.length === 0) return 0;

    const firstCandle = block.analysis[0];
    const lastCandle = block.analysis[block.analysis.length - 1];

    return ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100;
  }

  private calculateTradingPnL(
    currentBlock: CandleAnalyser,
    nextBlock: CandleAnalyser,
    prediction: any,
    capital: number,
    leverage: number,
  ): any {
    // Precio de entrada: último precio conocido del bloque actual (momento de la predicción)
    const entryPrice =
      currentBlock.analysis[currentBlock.analysis.length - 1].close;

    // Precio de salida: cierre del bloque siguiente (para verificar si la predicción fue correcta)
    const exitPrice = nextBlock.analysis[nextBlock.analysis.length - 1].close;

    // Determinar dirección de la operación
    let positionSize = 0;
    let pnl = 0;

    if (prediction.direction === 'UP') {
      // Long position
      positionSize = (capital * leverage) / entryPrice;
      pnl = (exitPrice - entryPrice) * positionSize;
    } else if (prediction.direction === 'DOWN') {
      // Short position
      positionSize = (capital * leverage) / entryPrice;
      pnl = (entryPrice - exitPrice) * positionSize;
    } else {
      // SIDEWAYS - no trade
      return {
        entryPrice,
        exitPrice,
        pnl: 0,
        pnlPercent: 0,
        leverage,
        capital,
      };
    }

    const pnlPercent = (pnl / capital) * 100;

    return {
      entryPrice,
      exitPrice,
      pnl,
      pnlPercent,
      leverage,
      capital,
    };
  }

  private calculateSummary(predictions: PredictionResult[]) {
    const totalPredictions = predictions.length;
    const correctPredictions = predictions.filter(
      (p) =>
        p.targetBlock.exists &&
        p.prediction.direction === p.targetBlock.actualDirection,
    ).length;

    const accuracy =
      totalPredictions > 0 ? (correctPredictions / totalPredictions) * 100 : 0;

    const trades = predictions.filter((p) => p.trading !== null);
    const totalPnL = trades.reduce((sum, p) => sum + (p.trading?.pnl || 0), 0);
    const totalPnLPercent = trades.reduce(
      (sum, p) => sum + (p.trading?.pnlPercent || 0),
      0,
    );

    const bestPrediction = predictions
      .filter((p) => p.trading)
      .reduce(
        (best, current) =>
          (current.trading?.pnl || 0) > (best.trading?.pnl || 0)
            ? current
            : best,
        predictions.find((p) => p.trading) || null,
      );

    const worstPrediction = predictions
      .filter((p) => p.trading)
      .reduce(
        (worst, current) =>
          (current.trading?.pnl || 0) < (worst.trading?.pnl || 0)
            ? current
            : worst,
        predictions.find((p) => p.trading) || null,
      );

    return {
      totalPredictions,
      correctPredictions,
      accuracy,
      totalPnL,
      totalPnLPercent,
      bestPrediction,
      worstPrediction,
    };
  }

  private generateInsights(analysis: RetroactiveAnalysis): string[] {
    const insights: string[] = [];

    if (analysis.summary.accuracy > 70) {
      insights.push(
        `🎯 Excelente precisión: ${analysis.summary.accuracy.toFixed(1)}%`,
      );
    } else if (analysis.summary.accuracy > 60) {
      insights.push(
        `✅ Buena precisión: ${analysis.summary.accuracy.toFixed(1)}%`,
      );
    } else if (analysis.summary.accuracy > 50) {
      insights.push(
        `⚠️ Precisión moderada: ${analysis.summary.accuracy.toFixed(1)}%`,
      );
    } else {
      insights.push(
        `❌ Precisión baja: ${analysis.summary.accuracy.toFixed(1)}%`,
      );
    }

    if (analysis.summary.totalPnL > 0) {
      insights.push(
        `💰 PnL positivo: $${analysis.summary.totalPnL.toFixed(2)} (${analysis.summary.totalPnLPercent.toFixed(1)}%)`,
      );
    } else {
      insights.push(
        `📉 PnL negativo: $${analysis.summary.totalPnL.toFixed(2)} (${analysis.summary.totalPnLPercent.toFixed(1)}%)`,
      );
    }

    if (analysis.summary.bestPrediction) {
      insights.push(
        `🏆 Mejor trade: $${analysis.summary.bestPrediction.trading?.pnl.toFixed(2)} (${analysis.summary.bestPrediction.trading?.pnlPercent.toFixed(1)}%)`,
      );
    }

    return insights;
  }
}
