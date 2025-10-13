import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingOrchestratorService } from './services/trading-orchestrator.service';
import { SimulationEngineService } from './services/simulation-engine.service';
import { TradingOrchestratorController } from './controllers/trading-orchestrator.controller';
import {
  TradingSetup,
  TradingSetupSchema,
} from './schemas/trading-setup.schema';
import {
  CandleAnalyser,
  CandleAnalyserSchema,
} from '../analyser/schemas/candle-analyser.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TradingSetup.name, schema: TradingSetupSchema },
      { name: CandleAnalyser.name, schema: CandleAnalyserSchema },
    ]),
  ],
  controllers: [TradingOrchestratorController],
  providers: [TradingOrchestratorService, SimulationEngineService],
  exports: [TradingOrchestratorService, SimulationEngineService],
})
export class TradingOrchestratorModule {}
