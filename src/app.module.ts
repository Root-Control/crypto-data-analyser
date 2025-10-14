import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RedisModule } from './third-party-services/redis/redis.module';
import { DatabaseModule } from './modules/database/database.module';
import { AnalyserModule } from './modules/analyser/analyser.module';
import { TradingOrchestratorModule } from './modules/trading-orchestrator/trading-orchestrator.module';
import { BookModule } from './modules/book/book.module';
import { AppController } from './app.controller';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    RedisModule,
    AnalyserModule,
    TradingOrchestratorModule,
    BookModule, // 📖 Módulo aislado para Order Book
  ],
  providers: [],
  controllers: [AppController],
})
export class AppModule {}
