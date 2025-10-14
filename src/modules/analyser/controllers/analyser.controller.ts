import { Controller, Get, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CandleAnalyser } from '../schemas/candle-analyser.schema';

@Controller('analyser')
export class AnalyserController {
  constructor(
    @InjectModel(CandleAnalyser.name)
    private candleAnalyserModel: Model<CandleAnalyser>,
  ) {}

  @Get('candles')
  async getCandles(
    @Query('pair') pair = 'ETHUSDT',
    @Query('startDate') startDate?: string,
    @Query('limit') limit = '10',
  ) {
    const query: any = { pair };
    if (startDate) {
      query.startDate = startDate;
    }

    const candles = await this.candleAnalyserModel
      .find(query)
      .sort({ startDate: -1, startTime: -1 })
      .limit(parseInt(limit))
      .exec();

    return {
      success: true,
      count: candles.length,
      data: candles,
    };
  }

  @Get('candles/latest')
  async getLatestCandle(@Query('pair') pair = 'ETHUSDT') {
    const candle = await this.candleAnalyserModel
      .findOne({ pair })
      .sort({ startDate: -1, startTime: -1 })
      .exec();

    return {
      success: true,
      data: candle,
    };
  }

  @Get('predict')
  async getCandlesByDate(
    @Query('pair') pair = 'ETHUSDT',
    @Query('date') date?: string,
    @Query('limit') limit = '10',
  ) {
    if (!date) {
      return {
        success: false,
        error: 'Se requiere el parámetro date (ej: 2025-10-13)',
      };
    }

    // Validar formato de fecha
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return {
        success: false,
        error: 'Formato de fecha inválido. Use: YYYY-MM-DD',
      };
    }

    try {
      // Buscar velas por fecha
      const candles = await this.candleAnalyserModel
        .find({
          pair,
          startDate: date,
        })
        .sort({ startTime: 1 }) // Ordenar por hora ascendente
        .limit(parseInt(limit))
        .exec();

      return {
        success: true,
        pair,
        date,
        count: candles.length,
        data: candles.map((block) => ({
          blockId: `${block.startDate}_${block.startTime}`,
          startDate: block.startDate,
          startTime: block.startTime,
          status: block.status,
          candlesCount: block.analysis.length,
          analysis: block.analysis, // Las 15 velas intraminuto del bloque
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: `Error al buscar velas: ${error.message}`,
      };
    }
  }

  @Get('stats')
  async getStats(@Query('pair') pair = 'ETHUSDT') {
    const totalBlocks = await this.candleAnalyserModel.countDocuments({ pair });
    const latestBlock = await this.candleAnalyserModel
      .findOne({ pair })
      .sort({ startDate: -1, startTime: -1 })
      .exec();

    return {
      success: true,
      pair,
      totalBlocks,
      latestBlock: latestBlock
        ? {
            startDate: latestBlock.startDate,
            startTime: latestBlock.startTime,
            minutesAnalyzed: latestBlock.analysis.length,
          }
        : null,
    };
  }
}
