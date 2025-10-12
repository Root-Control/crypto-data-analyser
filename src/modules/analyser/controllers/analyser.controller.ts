import { Controller, Get, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CandleAnalyser } from '../schemas/candle-analyser.schema';
import { predictNextFromBlocks } from '../../../helpers/predictFromBlocks';

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
  async getPrediction(
    @Query('pair') pair = 'ETHUSDT',
    @Query('dateTimePrediction') dateTimePrediction?: string,
    @Query('showResultantValues') showResultantValues?: string,
  ) {
    if (!dateTimePrediction) {
      return {
        success: false,
        error: 'Se requiere dateTimePrediction (ej: 2025-10-11T19:45)',
      };
    }

    // Parsear fecha y hora de predicción (forzar UTC)
    const dateTimeUTC = dateTimePrediction.endsWith('Z')
      ? dateTimePrediction
      : `${dateTimePrediction}:00Z`;
    const predictionDate = new Date(dateTimeUTC);

    if (isNaN(predictionDate.getTime())) {
      return {
        success: false,
        error: 'Formato de dateTimePrediction inválido. Use: YYYY-MM-DDTHH:MM',
      };
    }

    // Calcular los 3 bloques anteriores (15, 30, 45 minutos antes)
    const block1Time = new Date(predictionDate.getTime() - 15 * 60 * 1000);
    const block2Time = new Date(predictionDate.getTime() - 30 * 60 * 1000);
    const block3Time = new Date(predictionDate.getTime() - 45 * 60 * 1000);

    const formatBlockTime = (date: Date) => {
      const hours = date.getUTCHours().toString().padStart(2, '0');
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Buscar los 3 bloques en la BD
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
        this.candleAnalyserModel.findOne({ pair, ...query }).exec(),
      ),
    );

    // Filtrar bloques que existen
    const validBlocks = blocks.filter((b) => b !== null) as CandleAnalyser[];

    if (validBlocks.length < 3) {
      return {
        success: false,
        error: `Solo se encontraron ${validBlocks.length} de 3 bloques requeridos`,
        blocksFound: validBlocks.map((b) => ({
          startDate: b.startDate,
          startTime: b.startTime,
        })),
        blocksSearched: blockQueries,
      };
    }

    // Generar predicción
    const prediction = predictNextFromBlocks(validBlocks);

    // Construir respuesta
    const response: any = {
      success: true,
      blocksUsed: validBlocks.length,
      prediction,
    };

    // Si showResultantValues es true, incluir todos los datos del bloque de predicción
    if (showResultantValues === 'true') {
      // Buscar el bloque para el cual se está prediciendo (si existe)
      const targetBlock = await this.candleAnalyserModel
        .findOne({
          pair,
          startDate: formatDate(predictionDate),
          startTime: formatBlockTime(predictionDate),
        })
        .exec();

      response.predictionFor = {
        startDate: formatDate(predictionDate),
        startTime: formatBlockTime(predictionDate),
        dateTime: dateTimePrediction,
        resultantData: targetBlock || null,
      };
    }

    return response;
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
