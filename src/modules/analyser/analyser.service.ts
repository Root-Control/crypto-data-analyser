import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as WebSocket from 'ws';
import {
  CandleAnalyser,
  MinuteAnalysis,
} from './schemas/candle-analyser.schema';
import { predictNextFromBlocks } from '../../helpers/predictFromBlocks';
import {
  startMinute,
  ingestTick,
  closeMinute,
  updateRollingStats,
  initRollingStats,
  addClimaxFlag,
  fmt,
  DEFAULT_PARAMS,
  type MinuteState as EngineMinuteState,
  type MinuteMetrics,
  type RollingStats,
} from '../../helpers/marketMinute';
import { serializeMinute } from '../../helpers/serializeMinute';

type Seq = 'HL' | 'LH' | 'H-' | '-L';

// Extended state para tracking de ciclos
interface ExtendedMinuteState extends EngineMinuteState {
  minuteNumber: number; // contador global
  clockMinute: number; // 0-59
  prevClosePx?: number; // para backward compatibility
}

interface MinuteData {
  minute: number;
  clockMinute: number;
  open: number;
  high: number;
  low: number;
  close: number;
  fluctuation: number;
  maxFluctuation: number;
  minFluctuation: number;
  timestamp: string;
}

@Injectable()
export class AnalyserService implements OnModuleInit {
  private readonly logger = new Logger(AnalyserService.name);
  private wsKline: WebSocket;
  private wsTrades: WebSocket;
  private readonly BINANCE_KLINE_WS =
    'wss://fstream.binance.com/ws/ethusdt@kline_1m';
  private readonly BINANCE_TRADES_WS =
    'wss://fstream.binance.com/ws/ethusdt@aggTrade';

  // Configuración
  private readonly PRINT_PREV_CLOSE =
    process.env.ANALYSER_PRINT_PREV_CLOSE !== 'false';
  private readonly PRINT_TIMES = process.env.ANALYSER_PRINT_TIMES !== 'false';
  private readonly PAIR = 'ETHUSDT';

  // Estado de recolección de datos
  private minuteCounter = 0;
  private currentMinuteState: ExtendedMinuteState | null = null;
  private last15Minutes: MinuteData[] = [];
  private currentCycleStartTime: string | null = null;

  // v8.1: Rolling stats para climax detection
  private rollingStats: RollingStats = initRollingStats(
    DEFAULT_PARAMS.climaxLookback,
  );

  constructor(
    @InjectModel(CandleAnalyser.name)
    private candleAnalyserModel: Model<CandleAnalyser>,
    private eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 Initializing Analyser Service...');
    this.logger.log(
      '📊 Analizando velas de 1 minuto con orden intra-minuto - ETHUSDT Futures',
    );
    this.logger.log(
      `   PrevClose: ${this.PRINT_PREV_CLOSE ? 'ON' : 'OFF'} | Times: ${this.PRINT_TIMES ? 'ON' : 'OFF'}`,
    );
    this.connectToKlineWebSocket();
    this.connectToTradesWebSocket();
  }

  private connectToKlineWebSocket() {
    this.logger.log(`📡 Connecting to Kline WS: ${this.BINANCE_KLINE_WS}`);

    this.wsKline = new WebSocket(this.BINANCE_KLINE_WS);

    this.wsKline.on('open', () => {
      this.logger.log('✅ Connected to Kline WebSocket');
    });

    this.wsKline.on('message', (data: WebSocket.Data) => {
      const message = JSON.parse(data.toString());
      const kline = message.k;

      // Detectar inicio y cierre de vela
      if (!kline.x && !this.currentMinuteState) {
        // Nueva vela empieza
        this.startNewMinute(kline);
      } else if (kline.x) {
        // Vela cerró
        this.closeMinute(kline);
      }
    });

    this.wsKline.on('error', (error) => {
      this.logger.error(`❌ Kline WS error: ${error.message}`);
    });

    this.wsKline.on('close', () => {
      this.logger.warn('⚠️ Kline WS closed. Reconnecting in 5s...');
      setTimeout(() => this.connectToKlineWebSocket(), 5000);
    });
  }

  private connectToTradesWebSocket() {
    this.logger.log(`📡 Connecting to Trades WS: ${this.BINANCE_TRADES_WS}`);

    this.wsTrades = new WebSocket(this.BINANCE_TRADES_WS);

    this.wsTrades.on('open', () => {
      this.logger.log('✅ Connected to Trades WebSocket');
      this.logger.log('');
    });

    this.wsTrades.on('message', (data: WebSocket.Data) => {
      const trade = JSON.parse(data.toString());
      this.processTrade(trade);
    });

    this.wsTrades.on('error', (error) => {
      this.logger.error(`❌ Trades WS error: ${error.message}`);
    });

    this.wsTrades.on('close', () => {
      this.logger.warn('⚠️ Trades WS closed. Reconnecting in 5s...');
      setTimeout(() => this.connectToTradesWebSocket(), 5000);
    });
  }

  // ===== Helpers =====
  private pct(n: number): string {
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(4)}%`;
  }

  private usd(n: number): string {
    return `$${n.toFixed(2)}`;
  }

  // v8.1: Ya no necesitamos estos helpers, el motor los maneja
  // (mantenidos para legacy code que podría referenciarlos)
  private secondsWithinMinute(ts: number, minuteStartTs: number): number {
    return Math.floor((ts - minuteStartTs) / 1000) % 60;
  }

  // ===== Métodos principales =====
  private startNewMinute(kline: any) {
    const openPx = parseFloat(kline.o);
    const ts = kline.t;
    const candleTime = new Date(ts);
    const clockMinute = candleTime.getUTCMinutes();

    this.minuteCounter++;

    // v8.1: Usar motor para inicializar estado
    const engineState = startMinute(openPx, ts);

    // Extender con metadata de tracking
    this.currentMinuteState = {
      ...engineState,
      minuteNumber: this.minuteCounter,
      clockMinute,
      prevClosePx:
        this.last15Minutes.length > 0
          ? this.last15Minutes[this.last15Minutes.length - 1].close
          : undefined,
    };
  }

  private processTrade(trade: any) {
    if (!this.currentMinuteState) return;

    // v8.1: Usar motor para ingerir tick
    const tick = {
      px: parseFloat(trade.p),
      vol: parseFloat(trade.q),
      ts: trade.T,
      isBuyerMaker: trade.m, // true = sell aggressor, false = buy aggressor
    };

    // Ingest con motor (incluye guards y validaciones)
    const updatedState = ingestTick(
      this.currentMinuteState,
      tick,
      DEFAULT_PARAMS,
    );

    // Preservar metadata de tracking
    this.currentMinuteState = {
      ...updatedState,
      minuteNumber: this.currentMinuteState.minuteNumber,
      clockMinute: this.currentMinuteState.clockMinute,
      prevClosePx: this.currentMinuteState.prevClosePx,
    };
  }

  private async closeMinute(kline: any) {
    if (!this.currentMinuteState) return;

    const st = this.currentMinuteState;
    const clockMinute = st.clockMinute;

    // v8.1: Cerrar minuto con motor (calcula 25 métricas)
    let metrics: MinuteMetrics = closeMinute(st, DEFAULT_PARAMS);

    // v8.1: Actualizar rolling stats
    this.rollingStats = updateRollingStats(this.rollingStats, metrics);

    // v8.1: Añadir flag de climax
    metrics = addClimaxFlag(metrics, this.rollingStats, DEFAULT_PARAMS);

    // Log mejorado con nuevas métricas
    const is15MinMark = clockMinute % 15 === 0;
    const mark = is15MinMark ? '⏰' : '  ';
    const trend = metrics.fluct >= 0 ? '🟢' : metrics.fluct === 0 ? '🟡' : '🔴';

    const candleTime = new Date(st.minuteStartTs);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const month = months[candleTime.getUTCMonth()];
    const day = candleTime.getUTCDate().toString().padStart(2, '0');
    const hours = candleTime.getUTCHours().toString().padStart(2, '0');
    const minutes = clockMinute.toString().padStart(2, '0');
    const timeStr = `${month} ${day} ${hours}:${minutes}`;

    // Log básico (legacy compatible)
    let logLine = `${mark} ${trend} ${timeStr} | `;
    logLine += `Open: ${this.usd(metrics.open)} → Close: ${this.usd(metrics.close)} | `;
    logLine += `Fluct: ${this.pct(metrics.fluct)} | `;
    logLine += `Max: ${this.pct(metrics.maxPct)} | `;
    logLine += `Min: ${this.pct(metrics.minPct)} | `;
    logLine += `Seq: ${metrics.seq}`;

    // v8.1: Log extendido (volumen + flags)
    logLine += ` | Vol: ${metrics.tickVol.toFixed(0)}`;
    logLine += ` | Imb: ${fmt(metrics.imbalance)}`;
    if (metrics.vwap) logLine += ` | VWAP: ${this.usd(metrics.vwap)}`;
    logLine += ` | Ticks: ${metrics.tickCount}`;

    // Flags
    const flagsStr = [];
    if (metrics.flags.bullish) flagsStr.push('BULL');
    if (metrics.flags.bearish) flagsStr.push('BEAR');
    if (metrics.flags.climax) flagsStr.push('CLIMAX');
    if (flagsStr.length > 0) logLine += ` | ${flagsStr.join('+')}`;

    if (this.PRINT_TIMES) {
      if (st.tHighSec !== undefined) logLine += ` | tHigh: ${st.tHighSec}s`;
      if (st.tLowSec !== undefined) logLine += ` | tLow: ${st.tLowSec}s`;
    }

    if (this.PRINT_PREV_CLOSE && st.prevClosePx !== undefined) {
      logLine += ` | PrevClose: ${this.usd(st.prevClosePx)}`;
    }

    this.logger.log(logLine);

    // Guardar para reportes (legacy)
    const minuteData: MinuteData = {
      minute: st.minuteNumber,
      clockMinute,
      open: metrics.open,
      high: metrics.high,
      low: metrics.low,
      close: metrics.close,
      fluctuation: metrics.fluct,
      maxFluctuation: metrics.maxPct,
      minFluctuation: metrics.minPct,
      timestamp: new Date(st.minuteStartTs).toISOString(),
    };

    this.last15Minutes.push(minuteData);
    if (this.last15Minutes.length > 15) {
      this.last15Minutes.shift();
    }

    // ANTES de guardar el minuto, verificar si es inicio de nuevo ciclo
    if (is15MinMark) {
      // Si ya tenemos un ciclo anterior con 15 minutos, completarlo
      if (this.currentCycleStartTime && this.last15Minutes.length === 15) {
        await this.generateAndSaveReport();
      }

      // Establecer nuevo ciclo
      const hours = candleTime.getUTCHours().toString().padStart(2, '0');
      const minutes = clockMinute.toString().padStart(2, '0');
      this.currentCycleStartTime = `${hours}:${minutes}`;
    }

    // v8.1: Guardar en BD con motor serializado
    if (this.currentCycleStartTime) {
      await this.saveMinuteToDB(metrics, st);
    }

    // Resetear estado
    this.currentMinuteState = null;
  }

  private async saveMinuteToDB(
    metrics: MinuteMetrics,
    st: ExtendedMinuteState,
  ) {
    try {
      const candleTime = new Date(st.minuteStartTs);
      const startDate = candleTime.toISOString().split('T')[0]; // YYYY-MM-DD

      // v8.1: Serializar métricas con todas las fields nuevas
      const minuteAnalysis = serializeMinute(
        metrics,
        st, // para tHighSec/tLowSec
        st.prevClosePx, // para prevClose
      );

      // Buscar o crear documento
      await this.candleAnalyserModel.updateOne(
        {
          pair: this.PAIR,
          startDate,
          startTime: this.currentCycleStartTime,
        },
        {
          $setOnInsert: {
            pair: this.PAIR,
            startDate,
            startTime: this.currentCycleStartTime,
            status: 'in-progress',
          },
          $push: { analysis: minuteAnalysis },
        },
        { upsert: true },
      );
    } catch (error) {
      this.logger.error(`❌ Error guardando en BD: ${error.message}`);
    }
  }

  private async generateAndSaveReport() {
    const firstMin = this.last15Minutes[0].clockMinute;
    const lastMin =
      this.last15Minutes[this.last15Minutes.length - 1].clockMinute;
    const nextCycleStart = (lastMin + 1) % 60;
    const nextCycleEnd = (nextCycleStart + 14) % 60;

    // Calcular estadísticas del ciclo
    const firstMinute = this.last15Minutes[0];
    const lastMinute = this.last15Minutes[this.last15Minutes.length - 1];
    const initialPrice = firstMinute.open;
    const finalPrice = lastMinute.close;
    const totalFluctuation = ((finalPrice - initialPrice) / initialPrice) * 100;

    let upsCount = 0;
    let downsCount = 0;

    this.last15Minutes.forEach((data) => {
      if (data.fluctuation > 0) upsCount++;
      else if (data.fluctuation < 0) downsCount++;
    });

    // Marcar el bloque como completado si tiene 15 minutos
    if (this.last15Minutes.length === 15 && this.currentCycleStartTime) {
      await this.markBlockAsCompleted();
    }

    this.logger.log('');
    this.logger.log('📊 ========================================');
    this.logger.log(
      `📊 REPORTE: Ciclo [${firstMin.toString().padStart(2, '0')}-${lastMin.toString().padStart(2, '0')}] completado`,
    );
    this.logger.log(
      `💰 ${this.usd(initialPrice)} → ${this.usd(finalPrice)} | ${this.pct(totalFluctuation)}`,
    );
    this.logger.log(`📊 Minutos: ${upsCount}🟢 / ${downsCount}🔴`);
    this.logger.log(
      `📊 Próximo ciclo: [${nextCycleStart.toString().padStart(2, '0')}-${nextCycleEnd.toString().padStart(2, '0')}]`,
    );
    this.logger.log('📊 ========================================');
    this.logger.log('');
  }

  private async markBlockAsCompleted() {
    try {
      const lastMinuteTime = new Date(
        this.last15Minutes[this.last15Minutes.length - 1].timestamp,
      );
      const startDate = lastMinuteTime.toISOString().split('T')[0];

      await this.candleAnalyserModel.updateOne(
        {
          pair: this.PAIR,
          startDate,
          startTime: this.currentCycleStartTime,
        },
        {
          $set: { status: 'completed' },
        },
      );

      this.logger.log(
        `✅ Bloque marcado como COMPLETED: ${startDate} ${this.currentCycleStartTime}`,
      );

      // Inmediatamente buscar 3 bloques para predicción
      await this.triggerAutoPrediction(startDate, this.currentCycleStartTime!);
    } catch (error) {
      this.logger.error(
        `Error marcando bloque como completado: ${error.message}`,
      );
    }
  }

  private async triggerAutoPrediction(
    completedDate: string,
    completedTime: string,
  ) {
    try {
      this.logger.log('');
      this.logger.log('🔮 ==========================================');
      this.logger.log('🔮 AUTO-PREDICCIÓN ACTIVADA');
      this.logger.log('🔮 ==========================================');

      // Parsear tiempo completado
      const [hours, minutes] = completedTime.split(':').map(Number);
      const completedDateTime = new Date(completedDate);
      completedDateTime.setUTCHours(hours, minutes, 0, 0);

      // Calcular los 2 bloques anteriores (este ya está completado)
      const block1Time = new Date(completedDateTime.getTime() - 15 * 60 * 1000);
      const block2Time = new Date(completedDateTime.getTime() - 30 * 60 * 1000);

      const formatTime = (date: Date) => {
        const h = date.getUTCHours().toString().padStart(2, '0');
        const m = date.getUTCMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
      };

      const formatDate = (date: Date) => date.toISOString().split('T')[0];

      // Buscar los 3 bloques (orden: más viejo primero)
      const blockQueries = [
        {
          startDate: formatDate(block2Time),
          startTime: formatTime(block2Time),
        },
        {
          startDate: formatDate(block1Time),
          startTime: formatTime(block1Time),
        },
        { startDate: completedDate, startTime: completedTime },
      ];

      this.logger.log('🔍 Buscando 3 bloques (completados + 15 velas c/u):');

      const blocks = await Promise.all(
        blockQueries.map((query) =>
          this.candleAnalyserModel
            .findOne({ pair: this.PAIR, ...query, status: 'completed' })
            .exec(),
        ),
      );

      // Validar existencia y contenido de cada bloque
      let allValid = true;

      blockQueries.forEach((q, i) => {
        const block = blocks[i];
        const exists = block !== null;
        const hasCorrectLength = block?.analysis?.length === 15;

        if (exists && hasCorrectLength) {
          this.logger.log(
            `   ✅ ${i + 1}. ${q.startDate} ${q.startTime} (${block.analysis.length} velas)`,
          );
        } else if (exists && !hasCorrectLength) {
          this.logger.error(
            `   ❌ ${i + 1}. ${q.startDate} ${q.startTime} - Tiene ${block.analysis.length}/15 velas`,
          );
          allValid = false;
        } else {
          this.logger.error(
            `   ❌ ${i + 1}. ${q.startDate} ${q.startTime} - NO ENCONTRADO`,
          );
          allValid = false;
        }
      });

      if (!allValid) {
        this.logger.error('');
        this.logger.error('🔴 ==========================================');
        this.logger.error('🔴 PREDICCIÓN CANCELADA: Bloques incompletos');
        this.logger.error('🔴 ==========================================');
        this.logger.error('');
        return;
      }

      const validBlocks = blocks.filter((b) => b !== null) as CandleAnalyser[];

      this.logger.log('');
      this.logger.log('✅ 3 bloques válidos. Generando predicción...');

      // Generar predicción
      const prediction = predictNextFromBlocks(validBlocks);

      if (!prediction.ok) {
        this.logger.error('');
        this.logger.error('🔴 ==========================================');
        this.logger.error('🔴 ERROR EN PREDICCIÓN');
        this.logger.error(`🔴 ${prediction.reason}`);
        this.logger.error('🔴 ==========================================');
        this.logger.error('');
        return;
      }

      // Calcular ventana del siguiente bloque
      const nextBlockTime = new Date(
        completedDateTime.getTime() + 15 * 60 * 1000,
      );
      const blockWindow = {
        startDate: formatDate(nextBlockTime),
        startTime: formatTime(nextBlockTime),
        startTs: nextBlockTime.getTime(),
        endTs: nextBlockTime.getTime() + 15 * 60 * 1000,
      };

      this.logger.log('');
      this.logger.log('🟢 ==========================================');
      this.logger.log('🟢 PREDICCIÓN GENERADA EXITOSAMENTE');
      this.logger.log('🟢 ==========================================');
      this.logger.log(`   Bias: ${prediction.bias}`);
      this.logger.log(`   Setups: ${prediction.entries?.length || 0}`);
      this.logger.log(
        `   Para bloque: ${blockWindow.startDate} ${blockWindow.startTime}`,
      );
      this.logger.log(`   Key Level: $${prediction.levels?.keyLevel}`);
      this.logger.log(
        `   15m Range: $${prediction.levels?.last15mLow} - $${prediction.levels?.last15mHigh}`,
      );
      this.logger.log('🟢 ==========================================');

      // Emitir evento para que TradingOrchestrator lo active
      this.eventEmitter.emit('prediction.ready', {
        prediction,
        blockWindow,
        triggeredBy: 'auto',
      });

      this.logger.log(
        '📤 Evento enviado: prediction.ready → TradingOrchestrator',
      );
      this.logger.log('');
    } catch (error) {
      this.logger.error(`Error en auto-predicción: ${error.message}`);
    }
  }
}
