import { Module } from '@nestjs/common';
import { PredictionsService } from './predictions.service';
import { RedisModule } from '../../third-party-services/redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [PredictionsService],
  exports: [PredictionsService],
})
export class PredictionsModule {}
