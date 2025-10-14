import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyserController } from './controllers/analyser.controller';
import { PredictionController } from './controllers/prediction.controller';
import { RetroactivePredictionController } from './controllers/retroactive-prediction.controller';
import {
  CandleAnalyser,
  CandleAnalyserSchema,
} from './schemas/candle-analyser.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CandleAnalyser.name, schema: CandleAnalyserSchema },
    ]),
  ],
  controllers: [
    AnalyserController,
    PredictionController,
    RetroactivePredictionController,
  ],
  providers: [],
  exports: [],
})
export class AnalyserModule {}
