import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as WebSocket from 'ws';
import { RedisService } from '../../third-party-services/redis/redis.service';
import type {
  BinanceDepthSnapshot,
  DepthStreamPayload,
  BookSnapshot,
  BookLevel,
} from './types/book.types';

/**
 * BookService - Captura Order Book profundo de Binance y lo guarda en Redis
 *
 * Características:
 * - WebSocket: depth20@100ms (20 niveles, actualización cada 100ms)
 * - Solo ETHUSDT por ahora
 * - Cada tick → Redis (key: book:ETHUSDT)
 * - TTL: 60 segundos (se refresca constantemente)
 */
@Injectable()
export class BookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookService.name);
  private ws: WebSocket | null = null;
  private readonly symbol = 'ETHUSDT';
  private readonly streamUrl =
    'wss://stream.binance.com:9443/ws/ethusdt@depth20@100ms';
  private readonly redisKey = 'book:ETHUSDT';
  private readonly ttlSeconds = 60;

  // Estadísticas
  private tickCount = 0;
  private startTime = Date.now();

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.logger.log('📖 Iniciando BookService para ETHUSDT...');
    await this.connectWebSocket();
  }

  async onModuleDestroy() {
    this.logger.log('🛑 Deteniendo BookService...');
    this.disconnect();
  }

  /**
   * Conecta al WebSocket de Binance depth stream
   */
  private async connectWebSocket() {
    try {
      this.logger.log(`🔌 Intentando conectar a: ${this.streamUrl}`);
      this.ws = new WebSocket(this.streamUrl);

      this.ws.on('open', () => {
        this.logger.log(`✅ WebSocket conectado: ${this.streamUrl}`);
        this.logger.log(
          `🎯 Capturando order book depth20 para ${this.symbol} cada 100ms`,
        );
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        this.logger.error(`❌ WebSocket error: ${error.message}`, error.stack);
      });

      this.ws.on('close', (code, reason) => {
        this.logger.warn(
          `⚠️  WebSocket cerrado (code: ${code}, reason: ${reason.toString()}). Reconectando en 5s...`,
        );
        setTimeout(() => this.connectWebSocket(), 5000);
      });
    } catch (error) {
      this.logger.error(
        `❌ Error al conectar WebSocket: ${error.message}`,
        error.stack,
      );
      setTimeout(() => this.connectWebSocket(), 5000);
    }
  }

  /**
   * Procesa cada mensaje del WebSocket
   */
  private handleMessage(data: WebSocket.Data) {
    try {
      const payload = JSON.parse(data.toString());

      // DEBUG: Log del primer mensaje para ver el formato
      if (this.tickCount === 0) {
        this.logger.log(
          `🔍 Primer mensaje recibido: ${JSON.stringify(payload).substring(0, 200)}`,
        );
      }

      // Verificar si es un partial book depth (no tiene event type)
      // o si es un diff depth update (event type 'depthUpdate')
      const isPartialDepth =
        payload.lastUpdateId && payload.bids && payload.asks;
      const isDiffDepth = payload.e === 'depthUpdate';

      if (!isPartialDepth && !isDiffDepth) {
        this.logger.warn(
          `⚠️  Mensaje desconocido: ${JSON.stringify(payload).substring(0, 100)}`,
        );
        return;
      }

      // Convertir a estructura normalizada
      const snapshot = isPartialDepth
        ? this.buildSnapshotFromPartial(payload)
        : this.buildSnapshot(payload);

      // Guardar en Redis
      this.saveToRedis(snapshot);

      // Incrementar contador
      this.tickCount++;

      // Log cada 100 ticks (cada ~10 segundos)
      if (this.tickCount % 100 === 0) {
        this.logStats(snapshot);
      }
    } catch (error) {
      this.logger.error(
        `❌ Error procesando mensaje: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Construye snapshot desde partial book depth (snapshot inicial)
   */
  private buildSnapshotFromPartial(payload: any): BookSnapshot {
    // Los bids/asks vienen como [["price", "qty"], ...]
    const bidsRaw = payload.bids || [];
    const asksRaw = payload.asks || [];

    // Convertir a BookLevel[]
    const bids: BookLevel[] = bidsRaw.map(([price, qty]: [string, string]) => ({
      price,
      qty,
    }));
    const asks: BookLevel[] = asksRaw.map(([price, qty]: [string, string]) => ({
      price,
      qty,
    }));

    // Calcular métricas básicas
    const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
    const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 0;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    const totalBidQty = bids.reduce((sum, b) => sum + parseFloat(b.qty), 0);
    const totalAskQty = asks.reduce((sum, a) => sum + parseFloat(a.qty), 0);
    const total = totalBidQty + totalAskQty;
    const imbalance = total > 0 ? (totalBidQty - totalAskQty) / total : 0;

    return {
      symbol: this.symbol,
      timestamp: Date.now(),
      lastUpdateId: payload.lastUpdateId,
      bids,
      asks,
      spread,
      spreadPct,
      midPrice,
      totalBidQty,
      totalAskQty,
      imbalance,
    };
  }

  /**
   * Construye snapshot del order book desde el payload de Binance (depth update)
   */
  private buildSnapshot(payload: DepthStreamPayload): BookSnapshot {
    const bids: BookLevel[] = payload.b.map(([price, qty]) => ({ price, qty }));
    const asks: BookLevel[] = payload.a.map(([price, qty]) => ({ price, qty }));

    // Calcular métricas básicas
    const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
    const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 0;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;

    const totalBidQty = bids.reduce((sum, b) => sum + parseFloat(b.qty), 0);
    const totalAskQty = asks.reduce((sum, a) => sum + parseFloat(a.qty), 0);
    const total = totalBidQty + totalAskQty;
    const imbalance = total > 0 ? (totalBidQty - totalAskQty) / total : 0;

    return {
      symbol: payload.s,
      timestamp: payload.E,
      lastUpdateId: payload.u,
      bids,
      asks,
      spread,
      spreadPct,
      midPrice,
      totalBidQty,
      totalAskQty,
      imbalance,
    };
  }

  /**
   * Guarda snapshot en Redis con TTL
   */
  private async saveToRedis(snapshot: BookSnapshot) {
    try {
      // DEBUG: Log del primer snapshot guardado
      if (this.tickCount === 0) {
        this.logger.log(
          `💾 Guardando snapshot - Mid: ${snapshot.midPrice}, Spread: ${snapshot.spread}, BidQty: ${snapshot.totalBidQty}, AskQty: ${snapshot.totalAskQty}`,
        );
      }

      const serialized = JSON.stringify(snapshot);
      await this.redisService.set(this.redisKey, serialized, this.ttlSeconds);
    } catch (error) {
      this.logger.error(
        `❌ Error guardando en Redis: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Log de estadísticas cada N ticks
   */
  private logStats(snapshot: BookSnapshot) {
    const uptime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const ticksPerSec = (this.tickCount / parseFloat(uptime)).toFixed(1);

    this.logger.log(
      `📊 ${this.symbol} | Ticks: ${this.tickCount} (${ticksPerSec}/s) | ` +
        `Mid: $${snapshot.midPrice?.toFixed(2)} | ` +
        `Spread: ${snapshot.spreadPct?.toFixed(4)}% | ` +
        `Imb: ${((snapshot.imbalance ?? 0) * 100).toFixed(2)}% | ` +
        `Levels: ${snapshot.bids.length}/${snapshot.asks.length}`,
    );
  }

  /**
   * Desconecta el WebSocket
   */
  private disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Método público para obtener el último snapshot desde Redis
   */
  async getLatestSnapshot(): Promise<BookSnapshot | null> {
    try {
      const data = await this.redisService.get(this.redisKey);
      if (!data) return null;
      return JSON.parse(data) as BookSnapshot;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo snapshot: ${error.message}`);
      return null;
    }
  }

  /**
   * Estadísticas del servicio
   */
  getStats() {
    const uptime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return {
      symbol: this.symbol,
      tickCount: this.tickCount,
      uptimeSeconds: parseFloat(uptime),
      ticksPerSecond: (this.tickCount / parseFloat(uptime)).toFixed(2),
      connected: this.ws?.readyState === WebSocket.OPEN,
    };
  }
}
