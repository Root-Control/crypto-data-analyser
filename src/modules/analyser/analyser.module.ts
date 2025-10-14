import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyserService } from './analyser.service';
import { AnalyserController } from './controllers/analyser.controller';
import { PredictionController } from './controllers/prediction.controller';
import { RetroactivePredictionController } from './controllers/retroactive-prediction.controller';
import {
  CandleAnalyser,
  CandleAnalyserSchema,
} from './schemas/candle-analyser.schema';
import { BookModule } from '../book/book.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CandleAnalyser.name, schema: CandleAnalyserSchema },
    ]),
    BookModule, // 📖 Importar BookModule para acceder a BookService
  ],
  controllers: [
    AnalyserController,
    PredictionController,
    RetroactivePredictionController,
  ],
  providers: [AnalyserService],
  exports: [AnalyserService],
})
export class AnalyserModule {}
