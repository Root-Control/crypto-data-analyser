import { Controller, Get, Post } from '@nestjs/common';
import { PredictionsService } from './predictions.service';

@Controller('predictions')
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Get('redis-data')
  async getRedisData() {
    return await this.predictionsService.getRedisData();
  }

  @Post('trigger-cron')
  async triggerCron() {
    await this.predictionsService.triggerCronManually();
    return { message: 'Cron triggered manually' };
  }

  @Post('trigger-prediction')
  async triggerPrediction() {
    await this.predictionsService.triggerPredictionManually();
    return { message: 'Prediction triggered manually' };
  }

  @Get('binance-balance')
  async getBinanceBalance() {
    return this.predictionsService.getBinanceBalance();
  }
}
