import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './third-party-services/redis/redis.module';
import { DatabaseModule } from './modules/database/database.module';
import { AnalyserModule } from './modules/analyser/analyser.module';
import { AppController } from './app.controller';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    RedisModule,
    AnalyserModule,
  ],
  providers: [],
  controllers: [AppController],
})
export class AppModule {}
