import { Module } from '@nestjs/common';
import { BookService } from './book.service';
import { RedisModule } from '../../third-party-services/redis/redis.module';

/**
 * BookModule - Módulo aislado para capturar Order Book de Binance
 * 
 * Responsabilidades:
 * - Conectar a WebSocket depth20@100ms de ETHUSDT
 * - Guardar cada tick en Redis (key: book:ETHUSDT)
 * - Proveer acceso al último snapshot
 * 
 * NO modifica ningún otro módulo del sistema
 */
@Module({
  imports: [RedisModule],
  providers: [BookService],
  exports: [BookService], // Exportar por si otros módulos necesitan acceder
})
export class BookModule {}




