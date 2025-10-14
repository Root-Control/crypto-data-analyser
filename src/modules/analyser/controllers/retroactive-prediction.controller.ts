import { Controller, Get, Query, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CandleAnalyser } from '../schemas/candle-analyser.schema';
import {
  formatPrediction,
  getPredictionColor,
  getResults,
  type HistoricalCandle,
  type ResultEvaluation,
} from '../../../helpers/predictionEngine';
import { algoritmo1 } from '../../../algorithms/algoritmo1';
import { algoritmo2 } from '../../../algorithms/algoritmo2';
import { algoritmo3 } from '../../../algorithms/algoritmo3';

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
  ) {}

  @Get('debug-gaps')
  async debugGaps(@Query('pair') pair = 'ETHUSDT') {
    try {
      const allBlocks = await this.getAllBlocksSorted(pair);

      if (allBlocks.length === 0) {
        return {
          success: false,
          error: 'No se encontraron bloques de datos',
        };
      }

      // Analizar gaps sin sanitizar
      const gaps = [];
      for (let i = 1; i < allBlocks.length; i++) {
        const prevBlock = allBlocks[i - 1];
        const currentBlock = allBlocks[i];

        const prevTime = new Date(
          `${prevBlock.startDate}T${prevBlock.startTime}:00`,
        );
        const currentTime = new Date(
          `${currentBlock.startDate}T${currentBlock.startTime}:00`,
        );
        const diffMinutes =
          (currentTime.getTime() - prevTime.getTime()) / (1000 * 60);

        if (diffMinutes !== 15) {
          gaps.push({
            from: `${prevBlock.startDate}_${prevBlock.startTime}`,
            to: `${currentBlock.startDate}_${currentBlock.startTime}`,
            gapMinutes: diffMinutes,
            gapType: diffMinutes > 15 ? 'SALTO' : 'RETROCESO',
          });
        }
      }

      // Encontrar la secuencia más larga sin gaps
      const sequences = [];
      let currentSequence = [allBlocks[0]];

      for (let i = 1; i < allBlocks.length; i++) {
        const prevBlock = allBlocks[i - 1];
        const currentBlock = allBlocks[i];

        const prevTime = new Date(
          `${prevBlock.startDate}T${prevBlock.startTime}:00`,
        );
        const currentTime = new Date(
          `${currentBlock.startDate}T${currentBlock.startTime}:00`,
        );
        const diffMinutes =
          (currentTime.getTime() - prevTime.getTime()) / (1000 * 60);

        if (diffMinutes === 15) {
          // Continuar la secuencia
          currentSequence.push(currentBlock);
        } else {
          // Guardar secuencia actual y empezar nueva
          if (currentSequence.length >= 3) {
            sequences.push({
              length: currentSequence.length,
              start: `${currentSequence[0].startDate}_${currentSequence[0].startTime}`,
              end: `${currentSequence[currentSequence.length - 1].startDate}_${currentSequence[currentSequence.length - 1].startTime}`,
              blocks: currentSequence.map(
                (b) => `${b.startDate}_${b.startTime}`,
              ),
            });
          }
          currentSequence = [currentBlock];
        }
      }

      // Agregar la última secuencia
      if (currentSequence.length >= 3) {
        sequences.push({
          length: currentSequence.length,
          start: `${currentSequence[0].startDate}_${currentSequence[0].startTime}`,
          end: `${currentSequence[currentSequence.length - 1].startDate}_${currentSequence[currentSequence.length - 1].startTime}`,
          blocks: currentSequence.map((b) => `${b.startDate}_${b.startTime}`),
        });
      }

      return {
        success: true,
        totalBlocks: allBlocks.length,
        gapsFound: gaps.length,
        gaps: gaps,
        sequences: sequences,
        longestSequence:
          sequences.length > 0
            ? sequences.reduce((longest, current) =>
                current.length > longest.length ? current : longest,
              )
            : null,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('predict')
  async predict(
    @Query('pair') pair = 'ETHUSDT',
    @Query('showResults') showResults?: string,
    @Query('capital') capital: any = 400,
    @Query('leverage') leverage: any = 10,
  ) {
    try {
      this.logger.log(`🔮 Iniciando predicciones para ${pair}`);

      // PASO 1: Obtener datos sanitizados
      const allBlocks = await this.getAllBlocksSorted(pair);
      const sanitizedBlocks = await this.getLongestSequence(allBlocks);

      if (sanitizedBlocks.length < 3) {
        return {
          success: false,
          error: `Bloques insuficientes: ${sanitizedBlocks.length}`,
          timestamp: new Date().toISOString(),
        };
      }

      this.logger.log(`📊 Bloques sanitizados: ${sanitizedBlocks.length}`);

      // Normalizar parámetros numéricos
      const capitalNum = Number(capital);
      const leverageNum = Number(leverage);

      // PASO 2: ITERAR todos los items sanitizados para generar predicciones
      const predictions = [];
      for (let i = 0; i < sanitizedBlocks.length; i++) {
        // PASO 3: Array histórico desde 0 hasta i
        const historicalBlocks = sanitizedBlocks.slice(0, i + 1);

        // PASO 4: Llamar función predict() separada
        const prediction = await this.predictForHistoricalBlocks(
          historicalBlocks,
          i,
          capitalNum,
          leverageNum,
        );

        // PASO 5: Atachar predicción al item actual
        const currentBlock = sanitizedBlocks[i];
        const predictionForNextMinute = prediction
          ? {
              ...prediction,
              nextMinuteTimePrediction: {
                fecha: prediction.targetBlock?.fecha,
                hora: prediction.targetBlock?.hora,
              },
            }
          : null;

        predictions.push({
          index: i,
          bloqueId: `${currentBlock.startDate}_${currentBlock.startTime}`,
          fecha: currentBlock.startDate,
          hora: currentBlock.startTime,
          status: currentBlock.status,
          analysisCount: currentBlock.analysis?.length || 0,
          historicalBlocksCount: historicalBlocks.length,
          predictionForNextMinute: predictionForNextMinute,
        });

        this.logger.debug(
          `🔮 Índice ${i}: ${historicalBlocks.length} bloques históricos → ${predictionForNextMinute?.direction || 'N/A'}`,
        );
      }

      // PASO 6: TERCER STAGE - Evaluar resultados
      const results = [];
      let a1Evaluated = 0,
        a1Correct = 0,
        a1PnL = 0,
        a1PnLPct = 0;
      let a2Evaluated = 0,
        a2Correct = 0,
        a2PnL = 0,
        a2PnLPct = 0;
      let a3Evaluated = 0,
        a3Correct = 0,
        a3PnL = 0,
        a3PnLPct = 0;

      // Arrays para almacenar predicciones de cada algoritmo
      const a1Predictions: any[] = [];
      const a2Predictions: any[] = [];
      const a3Predictions: any[] = [];
      for (let i = 0; i < predictions.length; i++) {
        const prediction = predictions[i];
        const currentBlock = sanitizedBlocks[i];

        // Buscar el bloque siguiente para evaluar resultado
        const nextBlock = sanitizedBlocks[i + 1];

        let resultEvaluation: ResultEvaluation = { exists: false };

        // Agregar TODAS las predicciones de algoritmo3 (incluyendo SIDEWAYS)
        if (prediction.predictionForNextMinute) {
          // Solo evaluar si hay predicción y no es SIDEWAYS
          if (
            prediction.predictionForNextMinute.direction !== 'SIDEWAYS' &&
            nextBlock
          ) {
            // Llamar a getResults con la predicción y el bloque siguiente
            resultEvaluation = getResults(
              prediction.predictionForNextMinute,
              nextBlock,
            );

            this.logger.debug(
              `📊 Evaluando resultado ${i}: ${prediction.predictionForNextMinute.direction} → ${resultEvaluation.exists ? 'EXISTS' : 'NO_DATA'}`,
            );

            // Contabilizar para algoritmo3
            a3Evaluated++;
            if (
              resultEvaluation.actualDirection ===
              prediction.predictionForNextMinute.direction
            )
              a3Correct++;
            a3PnL += resultEvaluation.pnl || 0;
            a3PnLPct += resultEvaluation.pnlPercent || 0;
          }

          a3Predictions.push({
            blockId: prediction.bloqueId,
            fecha: prediction.fecha,
            hora: prediction.hora,
            direction: prediction.predictionForNextMinute.direction,
            confidence: prediction.predictionForNextMinute.confidence,
            expectedMove: prediction.predictionForNextMinute.expectedMove,
            riskLevel: prediction.predictionForNextMinute.riskLevel,
            analysis: prediction.predictionForNextMinute.analysis,
            trading: prediction.predictionForNextMinute.trading,
            targetBlock: prediction.predictionForNextMinute.targetBlock,
            nextMinuteTimePrediction:
              prediction.predictionForNextMinute.nextMinuteTimePrediction,
            result: resultEvaluation.exists ? resultEvaluation : null,
          });
        }

        // Evaluar algoritmo1 y algoritmo2 en paralelo (solo resumen)
        if (nextBlock && currentBlock) {
          const historicalBlocksA = sanitizedBlocks.slice(0, i + 1);
          const histCandlesA =
            this.convertBlocksToHistoricalCandles(historicalBlocksA);
          const currentBookA =
            currentBlock.analysis[currentBlock.analysis.length - 1]?.book ||
            null;

          const p1 = algoritmo1(histCandlesA as any, currentBookA as any, 3);

          let trade1 = null;
          let result1 = null;

          if (p1 && p1.direction !== 'SIDEWAYS') {
            trade1 = this.calculateTradingSetup(
              currentBlock,
              p1 as any,
              capitalNum,
              leverageNum,
            );
            const p1WithTrading = {
              direction: p1.direction,
              trading: trade1,
            } as any;
            result1 = getResults(p1WithTrading as any, nextBlock as any);
            if (result1.exists) {
              a1Evaluated++;
              if (result1.actualDirection === p1.direction) a1Correct++;
              a1PnL += result1.pnl || 0;
              a1PnLPct += result1.pnlPercent || 0;
            }
          }

          a1Predictions.push({
            blockId: `${currentBlock.startDate}_${currentBlock.startTime}`,
            direction: p1.direction,
            confidence: p1.confidence,
            expectedMove: p1.expectedMove,
            riskLevel: p1.riskLevel,
            analysis: p1.breakdown,
            trading: trade1,
            result: result1,
          });

          const p2 = algoritmo2(histCandlesA as any, currentBookA as any, 3);

          let trade2 = null;
          let result2 = null;

          if (p2 && p2.direction !== 'SIDEWAYS') {
            trade2 = this.calculateTradingSetup(
              currentBlock,
              p2 as any,
              capitalNum,
              leverageNum,
            );
            const p2WithTrading = {
              direction: p2.direction,
              trading: trade2,
            } as any;
            result2 = getResults(p2WithTrading as any, nextBlock as any);
            if (result2.exists) {
              a2Evaluated++;
              if (result2.actualDirection === p2.direction) a2Correct++;
              a2PnL += result2.pnl || 0;
              a2PnLPct += result2.pnlPercent || 0;
            }
          }

          a2Predictions.push({
            blockId: `${currentBlock.startDate}_${currentBlock.startTime}`,
            direction: p2.direction,
            confidence: p2.confidence,
            expectedMove: p2.expectedMove,
            riskLevel: p2.riskLevel,
            analysis: p2.breakdown,
            trading: trade2,
            result: result2,
          });
        }

        // Solo algoritmo3

        // Construir resultado final sin datos intraminuto
        const firstNext = nextBlock?.analysis?.[0];
        const lastNext = nextBlock?.analysis?.[nextBlock?.analysis?.length - 1];
        const round2 = (n: number) =>
          typeof n === 'number' ? Math.round(n * 100) / 100 : n;
        const finalResult = {
          index: prediction.index,
          bloqueId: prediction.bloqueId,
          fecha: prediction.fecha,
          hora: prediction.hora,
          status: prediction.status,
          analysisCount: prediction.analysisCount,
          historicalBlocksCount: prediction.historicalBlocksCount,
          predictionForNextMinute: prediction.predictionForNextMinute,
          resultado: resultEvaluation.exists
            ? {
                existe: true,
                direccionReal: resultEvaluation.actualDirection,
                movimientoReal: resultEvaluation.actualMove,
                pnl: resultEvaluation.pnl,
                pnlPercent: resultEvaluation.pnlPercent,
                takeProfitReached: resultEvaluation.takeProfitReached,
                stopLossReached: resultEvaluation.stopLossReached,
                exitPrice: resultEvaluation.exitPrice,
                exitReason: resultEvaluation.exitReason,
                correcto:
                  resultEvaluation.actualDirection ===
                  prediction.predictionForNextMinute?.direction,
                detalles: {
                  open:
                    (resultEvaluation.details as any)?.open ??
                    (firstNext ? round2(firstNext.open) : null),
                  close:
                    (resultEvaluation.details as any)?.close ??
                    (lastNext ? round2(lastNext.close) : null),
                  ...(resultEvaluation.details || {}),
                },
              }
            : { existe: false },
        };

        results.push(finalResult);
      }

      // Calcular estadísticas de resultados
      const validResults = results.filter(
        (r) => r.resultado && r.resultado.existe,
      );
      const correctPredictions = validResults.filter(
        (r) => r.resultado.correcto,
      ).length;
      const totalPnL = validResults.reduce(
        (sum, r) => sum + (r.resultado.pnl || 0),
        0,
      );
      const totalPnLPercent = validResults.reduce(
        (sum, r) => sum + (r.resultado.pnlPercent || 0),
        0,
      );
      const accuracy =
        validResults.length > 0
          ? (correctPredictions / validResults.length) * 100
          : 0;

      const response: any = {
        success: true,
        pair,
        timestamp: new Date().toISOString(),
        temporalidad: new Date().toLocaleTimeString('es-ES', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        }),
        data: {
          totalBlocks: sanitizedBlocks.length,
          predictionsGenerated: results.filter(
            (r) => r.predictionForNextMinute !== null,
          ).length,
          // Solo desglose por algoritmo
          algorithms: {
            algoritmo1: {
              resultsEvaluated: a1Evaluated,
              correctPredictions: a1Correct,
              accuracy:
                a1Evaluated > 0
                  ? Math.round((a1Correct / a1Evaluated) * 100 * 100) / 100
                  : 0,
              totalPnL: Math.round(a1PnL * 100) / 100,
              totalPnLPercent: Math.round(a1PnLPct * 100) / 100,
              predictions: a1Predictions,
            },
            algoritmo2: {
              resultsEvaluated: a2Evaluated,
              correctPredictions: a2Correct,
              accuracy:
                a2Evaluated > 0
                  ? Math.round((a2Correct / a2Evaluated) * 100 * 100) / 100
                  : 0,
              totalPnL: Math.round(a2PnL * 100) / 100,
              totalPnLPercent: Math.round(a2PnLPct * 100) / 100,
              predictions: a2Predictions,
            },
            algoritmo3: {
              resultsEvaluated: a3Evaluated,
              correctPredictions: a3Correct,
              accuracy:
                a3Evaluated > 0
                  ? Math.round((a3Correct / a3Evaluated) * 100 * 100) / 100
                  : 0,
              totalPnL: Math.round(a3PnL * 100) / 100,
              totalPnLPercent: Math.round(a3PnLPct * 100) / 100,
              predictions: a3Predictions,
            },
          },
        },
      };

      // Ocultar resultados si showResults indica falso
      const hideResults =
        showResults === 'false' ||
        showResults === '0' ||
        showResults === 'no' ||
        showResults === 'off';
      if (hideResults) {
        delete response.results;
      }

      // Log de depuración: presencia de algorithms y sus métricas
      try {
        this.logger.log(
          `🧪 Alg1 ${a1Correct}/${a1Evaluated} PnL=${a1PnL.toFixed(2)} | Alg2 ${a2Correct}/${a2Evaluated} PnL=${a2PnL.toFixed(2)} | Alg3 ${a3Correct}/${a3Evaluated} PnL=${a3PnL.toFixed(2)}`,
        );
        this.logger.log(
          `🧪 data.algorithms present: ${'algorithms' in response.data}`,
        );
        this.logger.log(
          `🧪 showResults param: ${showResults} → hideResults=${hideResults}`,
        );
      } catch (e) {
        this.logger.warn(`Algorithms debug log error: ${(e as any)?.message}`);
      }

      this.logger.log(
        `✅ Predicciones completadas: ${results.filter((r) => r.predictionForNextMinute !== null).length}/${sanitizedBlocks.length}`,
      );
      this.logger.log(
        `📊 Resultados evaluados: ${validResults.length} | Precisión: ${accuracy.toFixed(1)}% | P&L: $${totalPnL.toFixed(2)} (${totalPnLPercent.toFixed(1)}%)`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `❌ Error en predicciones: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('deep-analysis')
  async deepAnalysis(
    @Query('pair') pair = 'ETHUSDT',
    @Query('capital') capital = 400,
    @Query('leverage') leverage = 10,
  ) {
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

      // Análisis profundo: solo predicciones UP/DOWN con trading
      const analysis = await this.executeRetroactiveAnalysis(
        validation.validBlocks,
        capital,
        leverage,
      );

      // Filtrar solo predicciones UP/DOWN (excluir SIDEWAYS y sin predicción)
      const tradingPredictions = analysis.predictions.filter(
        (p) =>
          p.prediction &&
          p.prediction.direction !== 'SIDEWAYS' &&
          p.trading !== null,
      );

      const summary = this.calculateSummary(tradingPredictions);

      const response = {
        success: true,
        pair,
        timestamp: new Date().toISOString(),
        temporalidad: new Date().toLocaleTimeString('es-ES', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        }),
        parameters: {
          capital,
          leverage,
        },
        validation: {
          validBlocksQty: validation.validBlocks.length,
          removedBlocksQty: validation.removedBlocks.length,
        },
        // Solo grupos con predicciones UP/DOWN
        grupos: analysis.predictions
          .filter(
            (p) =>
              p.prediction &&
              p.prediction.direction !== 'SIDEWAYS' &&
              p.trading !== null,
          )
          .map((prediction, index) => {
            const blockIndex = prediction.index;
            const currentBlock = validation.validBlocks[blockIndex];

            return {
              indice: blockIndex,
              bloqueId: `${currentBlock.startDate}_${currentBlock.startTime}`,
              fecha: currentBlock.startDate,
              hora: currentBlock.startTime,
              status: currentBlock.status,
              analysisCount: currentBlock.analysis.length,
              nextCandlePrediction: {
                direccion: prediction.prediction.direction,
                confianza:
                  Math.round(prediction.prediction.confidence * 100) / 100,
                movimientoEsperado:
                  Math.round(prediction.prediction.expectedMove * 10000) /
                  10000,
                riesgo: prediction.prediction.riskLevel,
                targetBlock: {
                  bloqueId: `bloque_${prediction.index + 1}`,
                  fecha: 'N/A',
                  hora: 'N/A',
                },
              },
              resultado: prediction.targetBlock.exists
                ? {
                    direccionReal: prediction.targetBlock.actualDirection,
                    movimientoReal:
                      Math.round(prediction.targetBlock.actualMove * 10000) /
                      10000,
                    correcto: this.isPredictionCorrect(
                      prediction.prediction.direction,
                      prediction.targetBlock.actualDirection,
                    ),
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
                    takeProfitPrice: (prediction.trading as any).takeProfitPrice
                      ? Math.round(
                          (prediction.trading as any).takeProfitPrice * 100,
                        ) / 100
                      : null,
                    pnl: Math.round(prediction.trading.pnl * 100) / 100,
                    pnlPercent:
                      Math.round(prediction.trading.pnlPercent * 100) / 100,
                    takeProfitReached: (prediction.trading as any)
                      .takeProfitReached,
                    expectedMove: (prediction.trading as any).expectedMove,
                    takeProfitPercent: (prediction.trading as any)
                      .takeProfitPercent
                      ? Math.round(
                          (prediction.trading as any).takeProfitPercent * 100,
                        ) / 100
                      : null,
                  }
                : null,
              puedePredecir: blockIndex >= 2,
            };
          }),
        resumen: {
          totalPredictions: summary.totalPredictions,
          correctPredictions: summary.correctPredictions,
          accuracy: Math.round(summary.accuracy * 100) / 100,
          totalPnL: Math.round(summary.totalPnL * 100) / 100,
          totalPnLPercent: Math.round(summary.totalPnLPercent * 100) / 100,
        },
        insights: this.generateInsights({
          ...analysis,
          summary,
        }),
      };

      this.logger.log(
        `✅ Análisis profundo completado: ${summary.correctPredictions}/${summary.totalPredictions} correctas (${summary.accuracy.toFixed(1)}%)`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `❌ Error en análisis profundo: ${error.message}`,
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
    const query = { pair };

    // Query para datos anteriores al 13 de octubre 11:30 AM
    /*     const query = {
      pair,
      $or: [
        { startDate: { $lt: '2025-10-13' } },
        {
          startDate: '2025-10-13',
          startTime: { $lt: '11:30' },
        },
      ],
    }; */
    const sort = { startDate: 1 as const, startTime: 1 as const };

    return await this.candleAnalyserModel.find(query).sort(sort).exec();
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
        const prediction = algoritmo3(historicalCandles, currentBook, 3);

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

        // Calcular setup de trading (SIN usar datos del nextBlock)
        let trading = null;
        if (prediction.direction !== 'SIDEWAYS') {
          trading = this.calculateTradingSetup(
            currentBlock,
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

  private async predictForHistoricalBlocks(
    historicalBlocks: CandleAnalyser[],
    currentIndex: number,
    capital = 400,
    leverage = 10,
  ): Promise<any> {
    try {
      // REGLA: Si array length <= 2, return null (no hay suficientes datos)
      if (historicalBlocks.length <= 2) {
        return null;
      }

      // Convertir a formato histórico para el motor de predicción
      const historicalCandles =
        this.convertBlocksToHistoricalCandles(historicalBlocks);

      // Obtener order book del último minuto del bloque actual
      const currentBlock = historicalBlocks[historicalBlocks.length - 1];
      const currentBook =
        currentBlock.analysis[currentBlock.analysis.length - 1]?.book || null;

      // Usar el motor de predicción existente
      const prediction = algoritmo3(historicalCandles, currentBook, 3);

      // Crear trading setup mejorado (sin usar datos futuros)
      const entryPrice =
        currentBlock.analysis[currentBlock.analysis.length - 1].close;
      const expectedMovePercent = prediction.expectedMove / 100;
      const takeProfitPercent = Math.min(expectedMovePercent * 1.0, 0.02); // 100% del movimiento esperado, max 2%
      const stopLossPercent = 0.01; // 1.0% Stop Loss

      let takeProfitPrice = 0;
      let stopLossPrice = 0;
      let positionSize = 0;

      if (prediction.direction === 'UP') {
        takeProfitPrice = entryPrice * (1 + takeProfitPercent);
        stopLossPrice = entryPrice * (1 - stopLossPercent);
        positionSize = (capital * leverage) / entryPrice;
      } else if (prediction.direction === 'DOWN') {
        takeProfitPrice = entryPrice * (1 - takeProfitPercent);
        stopLossPrice = entryPrice * (1 + stopLossPercent);
        positionSize = (capital * leverage) / entryPrice;
      }

      return {
        direction: prediction.direction,
        confidence: Math.round(prediction.confidence * 100) / 100,
        expectedMove: Math.round(prediction.expectedMove * 10000) / 10000,
        riskLevel: prediction.riskLevel,
        trading: {
          entryPrice: Math.round(entryPrice * 100) / 100,
          takeProfitPrice: Math.round(takeProfitPrice * 100) / 100,
          stopLossPrice: Math.round(stopLossPrice * 100) / 100,
          positionSize: Math.round(positionSize * 10000) / 10000,
          takeProfitPercent: Math.round(takeProfitPercent * 10000) / 100,
          stopLossPercent: Math.round(stopLossPercent * 10000) / 100,
          capital,
          leverage,
        },
        analysis: {
          momentumScore:
            Math.round(prediction.breakdown.momentumScore * 100) / 100,
          bookScore: Math.round(prediction.breakdown.bookScore * 100) / 100,
          flowScore: Math.round(prediction.breakdown.flowScore * 100) / 100,
          climaxScore: Math.round(prediction.breakdown.climaxScore * 100) / 100,
        },
        targetBlock: {
          // Calculamos el siguiente bloque (15 minutos después)
          bloqueId: this.calculateNextBlockId(
            currentBlock.startDate,
            currentBlock.startTime,
          ),
          fecha: this.calculateNextDate(
            currentBlock.startDate,
            currentBlock.startTime,
          ),
          hora: this.calculateNextTime(currentBlock.startTime),
        },
      };
    } catch (error) {
      this.logger.error(
        `❌ Error en predicción para índice ${currentIndex}: ${error.message}`,
      );
      return null;
    }
  }

  private calculateNextBlockId(startDate: string, startTime: string): string {
    const nextTime = this.calculateNextTime(startTime);
    const nextDate = this.calculateNextDate(startDate, startTime);
    return `${nextDate}_${nextTime}`;
  }

  private calculateNextDate(startDate: string, startTime: string): string {
    // Convertir a Date object
    const currentDateTime = new Date(`${startDate}T${startTime}:00`);

    // Agregar 15 minutos
    const nextDateTime = new Date(currentDateTime.getTime() + 15 * 60 * 1000);

    // Retornar solo la fecha en formato YYYY-MM-DD
    return nextDateTime.toISOString().split('T')[0];
  }

  private calculateNextTime(startTime: string): string {
    // Extraer horas y minutos
    const [hours, minutes] = startTime.split(':').map(Number);

    // Agregar 15 minutos
    let nextMinutes = minutes + 15;
    let nextHours = hours;

    // Manejar desbordamiento de minutos
    if (nextMinutes >= 60) {
      nextMinutes -= 60;
      nextHours += 1;
    }

    // Manejar desbordamiento de horas (24 horas)
    if (nextHours >= 24) {
      nextHours -= 24;
    }

    // Formatear con ceros a la izquierda
    return `${nextHours.toString().padStart(2, '0')}:${nextMinutes.toString().padStart(2, '0')}`;
  }

  private async getLongestSequence(
    blocks: CandleAnalyser[],
  ): Promise<CandleAnalyser[]> {
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

      if (diffMinutes === 15) {
        // Continuar la secuencia
        currentSequence.push(currentBlock);
      } else {
        // Guardar secuencia actual y empezar nueva
        if (currentSequence.length >= 3) {
          sequences.push(currentSequence);
        }
        currentSequence = [currentBlock];
      }
    }

    // Agregar la última secuencia
    if (currentSequence.length >= 3) {
      sequences.push(currentSequence);
    }

    // Retornar la secuencia más larga
    if (sequences.length === 0) {
      this.logger.warn('❌ No se encontraron secuencias válidas');
      return [];
    }

    const longestSequence = sequences.reduce((longest, current) =>
      current.length > longest.length ? current : longest,
    );

    this.logger.log(
      `🏆 Secuencia más larga: ${longestSequence.length} bloques`,
    );
    this.logger.log(
      `📍 Desde: ${longestSequence[0].startDate}_${longestSequence[0].startTime}`,
    );
    this.logger.log(
      `📍 Hasta: ${longestSequence[longestSequence.length - 1].startDate}_${longestSequence[longestSequence.length - 1].startTime}`,
    );

    return longestSequence;
  }

  private sanitizeConsecutiveBlocks(
    blocks: CandleAnalyser[],
  ): CandleAnalyser[] {
    if (blocks.length === 0) return [];

    // PASO 1: Verificar que todos tengan exactamente 15 analysis items
    const validBlocks = blocks.filter((block) => {
      if (!block.analysis || block.analysis.length !== 15) {
        this.logger.warn(
          `⚠️ Bloque ${block.startDate}_${block.startTime} tiene ${block.analysis?.length || 0} items (debe tener 15)`,
        );
        return false;
      }
      return true;
    });

    if (validBlocks.length === 0) {
      this.logger.error('❌ No hay bloques válidos con 15 analysis items');
      return [];
    }

    // PASO 2: Verificar intervalos de 15 minutos consecutivos
    const sanitizedBlocks: CandleAnalyser[] = [];

    for (let i = 0; i < validBlocks.length; i++) {
      const currentBlock = validBlocks[i];

      if (i === 0) {
        // Primer bloque siempre es válido
        sanitizedBlocks.push(currentBlock);
        continue;
      }

      const prevBlock = validBlocks[i - 1];

      // Calcular diferencia en minutos entre bloques
      const prevTime = new Date(
        `${prevBlock.startDate}T${prevBlock.startTime}:00`,
      );
      const currentTime = new Date(
        `${currentBlock.startDate}T${currentBlock.startTime}:00`,
      );
      const diffMinutes =
        (currentTime.getTime() - prevTime.getTime()) / (1000 * 60);

      if (diffMinutes === 15) {
        // Intervalo correcto de 15 minutos
        sanitizedBlocks.push(currentBlock);
      } else {
        // Gap detectado - eliminar todos los bloques anteriores y empezar de nuevo
        this.logger.warn(
          `⚠️ Gap detectado: ${diffMinutes} minutos entre ${prevBlock.startDate}_${prevBlock.startTime} y ${currentBlock.startDate}_${currentBlock.startTime}`,
        );
        this.logger.warn(
          `🧹 Eliminando ${sanitizedBlocks.length} bloques anteriores para mantener correlación`,
        );

        // Limpiar array y empezar desde el bloque actual
        sanitizedBlocks.length = 0;
        sanitizedBlocks.push(currentBlock);
      }
    }

    this.logger.log(
      `🧹 Sanitización completada: ${blocks.length} → ${sanitizedBlocks.length} bloques válidos`,
    );
    return sanitizedBlocks;
  }

  private generatePredictions(
    blocks: CandleAnalyser[],
    capital: number,
    leverage: number,
  ): any[] {
    const predictions: any[] = [];

    // Iterar desde índice 2 (necesita 2 previos)
    for (let i = 2; i < blocks.length; i++) {
      const currentBlock = blocks[i];
      const historicalBlocks = blocks.slice(0, i + 1); // Incluir el bloque actual

      try {
        // Convertir bloques históricos a formato para predicción
        const historicalCandles =
          this.convertBlocksToHistoricalCandles(historicalBlocks);

        // Obtener order book del último minuto del bloque actual
        const currentBook =
          currentBlock.analysis[currentBlock.analysis.length - 1]?.book || null;

        // Generar predicción completa
        const prediction = this.createCompletePrediction(
          historicalCandles,
          currentBook,
          currentBlock,
          capital,
          leverage,
        );

        predictions.push({
          index: i,
          currentBlock: {
            bloqueId: `${currentBlock.startDate}_${currentBlock.startTime}`,
            fecha: currentBlock.startDate,
            hora: currentBlock.startTime,
            status: currentBlock.status,
            analysisCount: currentBlock.analysis.length,
          },
          prediction: prediction,
          historicalBlocksCount: historicalBlocks.length,
          // NO incluimos resultado ni trading en esta etapa de sanitización
        });

        this.logger.debug(
          `🔮 Predicción generada para índice ${i}: ${prediction.direction} (${prediction.confidence}%)`,
        );
      } catch (error) {
        this.logger.error(
          `❌ Error generando predicción para índice ${i}: ${error.message}`,
        );
      }
    }

    return predictions;
  }

  private createCompletePrediction(
    historicalCandles: HistoricalCandle[],
    currentBook: any,
    currentBlock: CandleAnalyser,
    capital: number,
    leverage: number,
  ): any {
    // Usar el motor de predicción existente
    const prediction = algoritmo3(historicalCandles, currentBook, 3);

    // Calcular setup de trading completo
    const entryPrice =
      currentBlock.analysis[currentBlock.analysis.length - 1].close;
    const expectedMovePercent = prediction.expectedMove / 100;
    const takeProfitPercent = Math.min(expectedMovePercent * 1.0, 0.02); // 100% del movimiento esperado, máximo 2%
    const stopLossPercent = 0.01; // 1.0% Stop Loss fijo

    let takeProfitPrice = 0;
    let stopLossPrice = 0;
    let positionSize = 0;

    if (prediction.direction === 'UP') {
      takeProfitPrice = entryPrice * (1 + takeProfitPercent);
      stopLossPrice = entryPrice * (1 - stopLossPercent);
      positionSize = (capital * leverage) / entryPrice;
    } else if (prediction.direction === 'DOWN') {
      takeProfitPrice = entryPrice * (1 - takeProfitPercent);
      stopLossPrice = entryPrice * (1 + stopLossPercent);
      positionSize = (capital * leverage) / entryPrice;
    }

    return {
      direction: prediction.direction,
      confidence: Math.round(prediction.confidence * 100) / 100,
      expectedMove: Math.round(prediction.expectedMove * 10000) / 10000,
      riskLevel: prediction.riskLevel,

      // Trading setup (solo para UP/DOWN, null para SIDEWAYS)
      trading:
        prediction.direction !== 'SIDEWAYS'
          ? {
              entryPrice: Math.round(entryPrice * 100) / 100,
              takeProfitPrice:
                takeProfitPrice > 0
                  ? Math.round(takeProfitPrice * 100) / 100
                  : 0,
              stopLossPrice:
                stopLossPrice > 0 ? Math.round(stopLossPrice * 100) / 100 : 0,
              positionSize: Math.round(positionSize * 100) / 100,
              takeProfitPercent: Math.round(takeProfitPercent * 10000) / 100,
              stopLossPercent: Math.round(stopLossPercent * 10000) / 100,
              capital,
              leverage,
            }
          : null,

      // Análisis detallado
      analysis: {
        momentumScore: prediction.breakdown.momentumScore,
        bookScore: prediction.breakdown.bookScore,
        flowScore: prediction.breakdown.flowScore,
        climaxScore: prediction.breakdown.climaxScore,
      },
    };
  }

  private isPredictionCorrect(
    predictedDirection: 'UP' | 'DOWN' | 'SIDEWAYS',
    actualDirection: 'UP' | 'DOWN' | 'SIDEWAYS',
  ): boolean {
    // Si predijo SIDEWAYS, solo es correcto si el mercado también fue SIDEWAYS
    if (predictedDirection === 'SIDEWAYS') {
      return actualDirection === 'SIDEWAYS';
    }

    // Si predijo UP/DOWN, debe coincidir exactamente con el resultado
    return predictedDirection === actualDirection;
  }

  private calculateTradingSetup(
    currentBlock: CandleAnalyser,
    prediction: any,
    capital: number,
    leverage: number,
  ): any {
    // Precio de entrada: último precio conocido del bloque actual (momento de la predicción)
    const entryPrice =
      currentBlock.analysis[currentBlock.analysis.length - 1].close;

    // Calcular TAKE PROFIT y STOP LOSS mejorado (ANTES del trade)
    const expectedMovePercent = prediction.expectedMove / 100; // Convertir a decimal
    const takeProfitPercent = Math.min(expectedMovePercent * 1.2, 0.025); // 120% del movimiento esperado, max 2.5%
    const stopLossPercent = 0.008; // 0.8% Stop Loss (aumentado de 0.5%)

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

  private calculateSummary(predictions: PredictionResult[]) {
    const totalPredictions = predictions.length;
    const correctPredictions = predictions.filter(
      (p) =>
        p.targetBlock.exists &&
        this.isPredictionCorrect(
          p.prediction.direction,
          p.targetBlock.actualDirection,
        ),
    ).length;

    const accuracy =
      totalPredictions > 0 ? (correctPredictions / totalPredictions) * 100 : 0;

    const trades = predictions.filter((p) => p.trading !== null);
    const totalPnL = 0; // TODO: Calcular PnL real basado en verificación
    const totalPnLPercent = 0; // TODO: Calcular PnL% real basado en verificación

    const bestPrediction = null; // TODO: Calcular basado en verificación real
    const worstPrediction = null; // TODO: Calcular basado en verificación real

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
