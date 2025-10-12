import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as WebSocket from 'ws';
import {
  CandleAnalyser,
  MinuteAnalysis,
} from './schemas/candle-analyser.schema';

type Seq = 'HL' | 'LH' | 'H-' | '-L';

interface MinuteState {
  minuteStartTs: number; // epoch ms
  minuteNumber: number; // contador global
  clockMinute: number; // 0-59
  openPx: number;
  highPx: number;
  lowPx: number;
  closePx: number;
  tHighSec?: number; // 0..59
  tLowSec?: number; // 0..59
  prevClosePx?: number;
  highSet: boolean;
  lowSet: boolean;
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
  private currentMinuteState: MinuteState | null = null;
  private last15Minutes: MinuteData[] = [];
  private currentCycleStartTime: string | null = null;

  constructor(
    @InjectModel(CandleAnalyser.name)
    private candleAnalyserModel: Model<CandleAnalyser>,
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

  private secondsWithinMinute(ts: number, minuteStartTs: number): number {
    return Math.floor((ts - minuteStartTs) / 1000) % 60;
  }

  private computeSeq(st: MinuteState): Seq {
    const highAboveOpen = st.highPx > st.openPx;
    const lowBelowOpen = st.lowPx < st.openPx;

    if (st.tHighSec !== undefined && st.tLowSec !== undefined) {
      return st.tHighSec < st.tLowSec ? 'HL' : 'LH';
    } else if (highAboveOpen && !lowBelowOpen) {
      return 'H-';
    } else if (lowBelowOpen && !highAboveOpen) {
      return '-L';
    } else {
      // Sin movimiento significativo, convención
      return 'H-';
    }
  }

  // ===== Métodos principales =====
  private startNewMinute(kline: any) {
    const openPx = parseFloat(kline.o);
    const ts = kline.t;
    const candleTime = new Date(ts);
    const clockMinute = candleTime.getMinutes();

    this.minuteCounter++;

    this.currentMinuteState = {
      minuteStartTs: ts,
      minuteNumber: this.minuteCounter,
      clockMinute,
      openPx,
      highPx: openPx,
      lowPx: openPx,
      closePx: openPx,
      prevClosePx:
        this.last15Minutes.length > 0
          ? this.last15Minutes[this.last15Minutes.length - 1].close
          : undefined,
      highSet: false,
      lowSet: false,
    };
  }

  private processTrade(trade: any) {
    if (!this.currentMinuteState) return;

    const price = parseFloat(trade.p);
    const ts = trade.T; // transaction time

    this.currentMinuteState.closePx = price;

    // Actualizar high
    if (price > this.currentMinuteState.highPx) {
      this.currentMinuteState.highPx = price;
      if (
        !this.currentMinuteState.highSet &&
        price > this.currentMinuteState.openPx
      ) {
        this.currentMinuteState.tHighSec = this.secondsWithinMinute(
          ts,
          this.currentMinuteState.minuteStartTs,
        );
        this.currentMinuteState.highSet = true;
      }
    }

    // Actualizar low
    if (price < this.currentMinuteState.lowPx) {
      this.currentMinuteState.lowPx = price;
      if (
        !this.currentMinuteState.lowSet &&
        price < this.currentMinuteState.openPx
      ) {
        this.currentMinuteState.tLowSec = this.secondsWithinMinute(
          ts,
          this.currentMinuteState.minuteStartTs,
        );
        this.currentMinuteState.lowSet = true;
      }
    }
  }

  private closeMinute(kline: any) {
    if (!this.currentMinuteState) return;

    const st = this.currentMinuteState;
    const open = st.openPx;
    const high = st.highPx;
    const low = st.lowPx;
    const close = st.closePx;

    const fluct = ((close - open) / open) * 100;
    const maxPct = Math.max(0, ((high - open) / open) * 100);
    const minPct = Math.min(0, ((low - open) / open) * 100);

    const seq = this.computeSeq(st);
    const clockMinute = st.clockMinute;
    const is15MinMark = clockMinute % 15 === 0;
    const mark = is15MinMark ? '⏰' : '  ';

    // Si es marca de 15 minutos, establecer nuevo ciclo
    if (is15MinMark) {
      const candleTime = new Date(st.minuteStartTs);
      const hours = candleTime.getUTCHours().toString().padStart(2, '0');
      const minutes = clockMinute.toString().padStart(2, '0');
      this.currentCycleStartTime = `${hours}:${minutes}`;
    }

    const trend = fluct >= 0 ? '🟢' : fluct === 0 ? '🟡' : '🔴';

    // Formatear timestamp (UTC)
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

    // Construir log
    let logLine = `${mark} ${trend} ${timeStr} | `;
    logLine += `Open: ${this.usd(open)} → Close: ${this.usd(close)} | `;
    logLine += `Fluct: ${this.pct(fluct)} | `;
    logLine += `Max: ${this.pct(maxPct)} | `;
    logLine += `Min: ${this.pct(minPct)} | `;
    logLine += `Seq: ${seq}`;

    if (this.PRINT_TIMES) {
      if (st.tHighSec !== undefined) {
        logLine += ` | tHigh: ${st.tHighSec}s`;
      }
      if (st.tLowSec !== undefined) {
        logLine += ` | tLow: ${st.tLowSec}s`;
      }
    }

    if (this.PRINT_PREV_CLOSE && st.prevClosePx !== undefined) {
      logLine += ` | PrevClose: ${this.usd(st.prevClosePx)}`;
    }

    this.logger.log(logLine);

    // Guardar en BD si tenemos ciclo activo
    if (this.currentCycleStartTime) {
      this.saveMinuteToDB(
        st,
        open,
        high,
        low,
        close,
        fluct,
        maxPct,
        minPct,
        seq,
      );
    }

    // Guardar para reportes
    const minuteData: MinuteData = {
      minute: st.minuteNumber,
      clockMinute,
      open,
      high,
      low,
      close,
      fluctuation: fluct,
      maxFluctuation: maxPct,
      minFluctuation: minPct,
      timestamp: new Date(st.minuteStartTs).toISOString(),
    };

    this.last15Minutes.push(minuteData);
    if (this.last15Minutes.length > 15) {
      this.last15Minutes.shift();
    }

    // Generar reporte cada 15 minutos (cuando completamos un ciclo)
    if (is15MinMark && this.last15Minutes.length === 15) {
      this.generateAndSaveReport();
    }

    // Resetear estado
    this.currentMinuteState = null;
  }

  private async saveMinuteToDB(
    st: MinuteState,
    open: number,
    high: number,
    low: number,
    close: number,
    fluct: number,
    maxPct: number,
    minPct: number,
    seq: Seq,
  ) {
    try {
      const candleTime = new Date(st.minuteStartTs);
      const startDate = candleTime.toISOString().split('T')[0]; // YYYY-MM-DD
      const hours = candleTime.getUTCHours().toString().padStart(2, '0');
      const minutes = st.clockMinute.toString().padStart(2, '0');
      const minuteTime = `${hours}:${minutes}`;

      const minuteAnalysis: MinuteAnalysis = {
        minute: minuteTime,
        open,
        close,
        high,
        low,
        fluct,
        max: maxPct,
        min: minPct,
        seq,
        tHigh: st.tHighSec,
        tLow: st.tLowSec,
        prevClose: st.prevClosePx,
      };

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
          },
          $push: { analysis: minuteAnalysis },
        },
        { upsert: true },
      );
    } catch (error) {
      this.logger.error(`Error guardando en BD: ${error.message}`);
    }
  }

  private generateAndSaveReport() {
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
}
