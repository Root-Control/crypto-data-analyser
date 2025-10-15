import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceService } from './binance.service';

@Module({
  imports: [ConfigModule],
  providers: [BinanceService],
  exports: [BinanceService],
})
export class BinanceModule {}
