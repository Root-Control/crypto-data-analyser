import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyserService } from './analyser.service';
import { AnalyserController } from './controllers/analyser.controller';
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
  controllers: [AnalyserController],
  providers: [AnalyserService],
  exports: [AnalyserService],
})
export class AnalyserModule {}
