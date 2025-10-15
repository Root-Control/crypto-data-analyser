import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { PredictionsService } from './predictions.service';
import { PredictionsController } from './predictions.controller';
import { RedisModule } from '../../third-party-services/redis/redis.module';
import { BinanceModule } from '../../third-party-services/binance/binance.module';
import {
  CandleAnalyser,
  CandleAnalyserSchema,
} from '../analyser/schemas/candle-analyser.schema';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: CandleAnalyser.name, schema: CandleAnalyserSchema },
    ]),
    RedisModule,
    BinanceModule,
  ],
  controllers: [PredictionsController],
  providers: [PredictionsService],
  exports: [PredictionsService],
})
export class PredictionsModule {}
