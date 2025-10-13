import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TradingOrchestratorService } from '../services/trading-orchestrator.service';
import { TradingSetup } from '../schemas/trading-setup.schema';
import { CandleAnalyser } from '../../analyser/schemas/candle-analyser.schema';
import { predictNextFromBlocks } from '../../../helpers/predictFromBlocks';
import { BlockWindow } from '../types/trading.types';

@Controller('trading')
export class TradingOrchestratorController {
  constructor(
    private readonly orchestrator: TradingOrchestratorService,
    @InjectModel(CandleAnalyser.name)
    private candleAnalyserModel: Model<CandleAnalyser>,
    @InjectModel(TradingSetup.name)
    private tradingSetupModel: Model<TradingSetup>,
  ) {}

  @Post('activate')
  async activatePrediction(
    @Query('dateTimePrediction') dateTimePrediction: string,
  ) {
    if (!dateTimePrediction) {
      return {
        success: false,
        error: 'Se requiere dateTimePrediction (ej: 2025-10-11T19:45)',
      };
    }

    // Parsear fecha (UTC)
    const dateTimeUTC = dateTimePrediction.endsWith('Z')
      ? dateTimePrediction
      : `${dateTimePrediction}:00Z`;
    const predictionDate = new Date(dateTimeUTC);

    if (isNaN(predictionDate.getTime())) {
      return {
        success: false,
        error: 'Formato inválido. Use: YYYY-MM-DDTHH:MM',
      };
    }

    // Calcular ventana del bloque (15 minutos)
    const blockWindow: BlockWindow = {
      startDate: predictionDate.toISOString().split('T')[0],
      startTime: `${predictionDate.getUTCHours().toString().padStart(2, '0')}:${predictionDate.getUTCMinutes().toString().padStart(2, '0')}`,
      startTs: predictionDate.getTime(),
      endTs: predictionDate.getTime() + 15 * 60 * 1000,
    };

    // Obtener 3 bloques anteriores
    const block1Time = new Date(predictionDate.getTime() - 15 * 60 * 1000);
    const block2Time = new Date(predictionDate.getTime() - 30 * 60 * 1000);
    const block3Time = new Date(predictionDate.getTime() - 45 * 60 * 1000);

    const formatBlockTime = (date: Date) => {
      const hours = date.getUTCHours().toString().padStart(2, '0');
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    const blockQueries = [
      {
        startDate: formatDate(block3Time),
        startTime: formatBlockTime(block3Time),
      },
      {
        startDate: formatDate(block2Time),
        startTime: formatBlockTime(block2Time),
      },
      {
        startDate: formatDate(block1Time),
        startTime: formatBlockTime(block1Time),
      },
    ];

    const blocks = await Promise.all(
      blockQueries.map((query) =>
        this.candleAnalyserModel.findOne({ pair: 'ETHUSDT', ...query }).exec(),
      ),
    );

    const validBlocks = blocks.filter((b) => b !== null) as CandleAnalyser[];

    if (validBlocks.length < 3) {
      return {
        success: false,
        error: `Solo se encontraron ${validBlocks.length} de 3 bloques requeridos`,
        blocksSearched: blockQueries,
      };
    }

    // Generar predicción
    const prediction = predictNextFromBlocks(validBlocks);

    if (!prediction.ok) {
      return {
        success: false,
        error: 'Error en predicción',
        prediction,
      };
    }

    // Activar predicción en el orquestador
    const result = await this.orchestrator.activatePrediction(
      prediction,
      blockWindow,
    );

    return {
      success: true,
      prediction,
      activation: result,
      blockWindow,
    };
  }

  @Get('status')
  async getStatus() {
    return {
      success: true,
      activeSetups: this.orchestrator.getActiveSetupsCount(),
      currentPrice: this.orchestrator.getCurrentPrice(),
      config: this.orchestrator.getConfig(),
    };
  }

  @Get('setups')
  async getSetups(
    @Query('state') state?: string,
    @Query('blockId') blockId?: string,
  ) {
    const query: any = {};
    if (state) query.state = state;
    if (blockId) query.blockId = blockId;

    const setups = await this.tradingSetupModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();

    // Enriquecer cada setup con los datos de la vela analizada
    const enrichedSetups = await Promise.all(
      setups.map(async (setup) => {
        const setupObj: any = setup.toObject();

        // Buscar el bloque de la vela que se está prediciendo/analizando
        const [dateStr, timeStr] = setup.blockId.split('_');
        const candleBlock = await this.candleAnalyserModel
          .findOne({
            pair: setup.pair,
            startDate: dateStr,
            startTime: timeStr,
          })
          .exec();

        if (candleBlock) {
          setupObj.candleData = candleBlock;
        }

        return setupObj;
      }),
    );

    return {
      success: true,
      count: enrichedSetups.length,
      data: enrichedSetups,
    };
  }

  @Get('setups/active')
  async getActiveSetups() {
    const setups = await this.tradingSetupModel
      .find({ state: { $in: ['IDLE', 'ARMED', 'FILLED', 'TP1_FILLED'] } })
      .sort({ createdAt: -1 })
      .exec();

    return {
      success: true,
      count: setups.length,
      data: setups,
    };
  }

  @Get('performance')
  async getPerformance() {
    const closedSetups = await this.tradingSetupModel
      .find({ state: 'CLOSED' })
      .exec();

    const totalTrades = closedSetups.length;
    const totalPnL = closedSetups.reduce((sum, s) => sum + (s.pnl || 0), 0);
    const winners = closedSetups.filter((s) => (s.pnl || 0) > 0).length;
    const losers = closedSetups.filter((s) => (s.pnl || 0) < 0).length;
    const winRate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;

    const avgWin =
      winners > 0
        ? closedSetups
            .filter((s) => (s.pnl || 0) > 0)
            .reduce((sum, s) => sum + (s.pnl || 0), 0) / winners
        : 0;

    const avgLoss =
      losers > 0
        ? closedSetups
            .filter((s) => (s.pnl || 0) < 0)
            .reduce((sum, s) => sum + (s.pnl || 0), 0) / losers
        : 0;

    return {
      success: true,
      totalTrades,
      winners,
      losers,
      winRate: winRate.toFixed(2),
      totalPnL: totalPnL.toFixed(2),
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      profitFactor:
        losers > 0 ? (avgWin / Math.abs(avgLoss)).toFixed(2) : 'N/A',
    };
  }
}
