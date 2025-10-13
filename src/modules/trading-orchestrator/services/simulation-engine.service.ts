import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TradingSetup } from '../schemas/trading-setup.schema';
import { CandleAnalyser } from '../../analyser/schemas/candle-analyser.schema';
import { SetupExecution, TradingConfig } from '../types/trading.types';

interface SimulationResult {
  setupId: string;
  filled: boolean;
  fillPrice?: number;
  filledAt?: string;
  tp1Filled: boolean;
  tp1Price?: number;
  tp1At?: string;
  closed: boolean;
  closePrice?: number;
  closedAt?: string;
  closeReason?: string;
  pnl: number;
  mae: number;
  mfe: number;
  events: string[];
}

@Injectable()
export class SimulationEngineService {
  private readonly logger = new Logger(SimulationEngineService.name);

  constructor(
    @InjectModel(TradingSetup.name)
    private tradingSetupModel: Model<TradingSetup>,
    @InjectModel(CandleAnalyser.name)
    private candleAnalyserModel: Model<CandleAnalyser>,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Simula la ejecución de un setup usando velas reales del bloque
   */
  async simulateSetup(
    setup: SetupExecution,
    config: TradingConfig,
    invalidationLevel?: number,
  ): Promise<SimulationResult> {
    const result: SimulationResult = {
      setupId: setup.setupId,
      filled: false,
      tp1Filled: false,
      closed: false,
      pnl: 0,
      mae: 0,
      mfe: 0,
      events: [],
    };

    // Obtener velas del bloque
    const [dateStr, timeStr] = setup.blockId.split('_');
    const candleBlock = await this.candleAnalyserModel
      .findOne({
        pair: config.symbol,
        startDate: dateStr,
        startTime: timeStr,
      })
      .exec();

    if (!candleBlock || candleBlock.analysis.length === 0) {
      result.events.push('NO_CANDLES_FOUND');
      result.closeReason = 'EXPIRED';
      result.closed = true;
      return result;
    }

    const candles = candleBlock.analysis;

    // Estados para RETEST
    let retestState: 'IDLE' | 'WAIT_TOUCH_BAND' | 'WAIT_NEXT_CLOSE' | 'ACTIVE' =
      'IDLE';
    let bandTouchedAt = -1;

    // Estados para orden
    let fillPrice = 0;
    let filledAtIndex = -1;
    let tp1FilledAtIndex = -1;

    // Cantidades
    const totalQty = (config.baseCapital * config.leverage) / setup.entry;
    const tp1Qty = totalQty * config.tp1Split;
    const tp2Qty = totalQty * config.tp2Split;

    let currentSL = setup.sl;
    let positionQty = 0;

    // Iterar por cada vela del bloque
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const open = candle.open;
      const high = candle.high;
      const low = candle.low;
      const close = candle.close;

      // ===== ACTIVACIÓN DE RETEST =====
      if (setup.type.includes('RETEST') && retestState === 'IDLE') {
        retestState = 'WAIT_TOUCH_BAND';
      }

      if (setup.type.includes('RETEST') && retestState === 'WAIT_TOUCH_BAND') {
        // TODO: Verificar si toca banda (necesitaríamos levels.retestBand)
        // Por ahora saltar directamente a ACTIVE
        retestState = 'ACTIVE';
        result.events.push(`RETEST_ACTIVATED_AT_${candle.minute}`);
      }

      // ===== FILL DE ORDEN (si no está filled) =====
      if (!result.filled) {
        let tryFillAt: number | null = null;

        // MOMENTUM BUY STOP
        if (setup.type === 'MOMENTUM_BUY_STOP' && high >= setup.entry) {
          tryFillAt = open >= setup.entry ? open : setup.entry;
        }

        // MOMENTUM SELL STOP
        if (setup.type === 'MOMENTUM_SELL_STOP' && low <= setup.entry) {
          tryFillAt = open <= setup.entry ? open : setup.entry;
        }

        // RETEST BUY LIMIT (solo si está ACTIVE)
        if (
          setup.type === 'RETEST_LIMIT_AFTER_GREEN' &&
          retestState === 'ACTIVE' &&
          low <= setup.entry &&
          setup.entry <= high
        ) {
          tryFillAt = open <= setup.entry ? open : setup.entry;
        }

        // RETEST SELL LIMIT (solo si está ACTIVE)
        if (
          setup.type === 'RETEST_LIMIT_AFTER_RED' &&
          retestState === 'ACTIVE' &&
          low <= setup.entry &&
          setup.entry <= high
        ) {
          tryFillAt = open >= setup.entry ? open : setup.entry;
        }

        // Aplicar fill si se disparó
        if (tryFillAt !== null) {
          fillPrice = this.roundTick(tryFillAt, config.tickSize);
          filledAtIndex = i;
          positionQty = totalQty;
          result.filled = true;
          result.fillPrice = fillPrice;
          result.filledAt = candle.minute;
          result.events.push(`FILLED_AT_${candle.minute}_PRICE_${fillPrice}`);

          // Recalcular SL/TP basados en fillPrice (no en entry teórico)
          if (setup.bias === 'LONG') {
            currentSL = this.roundTick(
              fillPrice * (1 - 0.0015),
              config.tickSize,
            );
            setup.tp1 = this.roundTick(
              fillPrice * (1 + 0.002),
              config.tickSize,
            );
            setup.tp2 = this.roundTick(
              fillPrice * (1 + 0.0045),
              config.tickSize,
            );
          } else {
            currentSL = this.roundTick(
              fillPrice * (1 + 0.0015),
              config.tickSize,
            );
            setup.tp1 = this.roundTick(
              fillPrice * (1 - 0.002),
              config.tickSize,
            );
            setup.tp2 = this.roundTick(
              fillPrice * (1 - 0.0045),
              config.tickSize,
            );
          }
        }
      }

      // ===== GESTIÓN DE POSICIÓN FILLED =====
      if (result.filled && filledAtIndex >= 0) {
        // Actualizar MAE/MFE
        const unrealizedPnL = this.calculateUnrealizedPnL(
          fillPrice,
          close,
          positionQty,
          setup.bias,
        );

        if (unrealizedPnL < result.mae) result.mae = unrealizedPnL;
        if (unrealizedPnL > result.mfe) result.mfe = unrealizedPnL;

        // Evaluar TP1
        if (!result.tp1Filled) {
          if (setup.bias === 'LONG' && high >= setup.tp1) {
            const tp1FillPrice = open >= setup.tp1 ? open : setup.tp1;
            result.tp1Filled = true;
            result.tp1Price = this.roundTick(tp1FillPrice, config.tickSize);
            result.tp1At = candle.minute;
            tp1FilledAtIndex = i;
            positionQty = tp2Qty; // Solo queda TP2

            // Mover SL a breakeven mejorado
            currentSL = this.roundTick(
              fillPrice * (setup.bias === 'LONG' ? 0.9998 : 1.0002),
              config.tickSize,
            );
            result.events.push(
              `TP1_FILLED_AT_${candle.minute}_PRICE_${result.tp1Price}_SL_MOVED_TO_${currentSL}`,
            );
          } else if (setup.bias === 'SHORT' && low <= setup.tp1) {
            const tp1FillPrice = open <= setup.tp1 ? open : setup.tp1;
            result.tp1Filled = true;
            result.tp1Price = this.roundTick(tp1FillPrice, config.tickSize);
            result.tp1At = candle.minute;
            tp1FilledAtIndex = i;
            positionQty = tp2Qty;

            currentSL = this.roundTick(fillPrice * 1.0002, config.tickSize);
            result.events.push(
              `TP1_FILLED_AT_${candle.minute}_PRICE_${result.tp1Price}_SL_MOVED_TO_${currentSL}`,
            );
          }
        }

        // Evaluar SL
        if (setup.bias === 'LONG' && low <= currentSL) {
          const slFillPrice = open <= currentSL ? open : currentSL;
          result.closed = true;
          result.closePrice = this.roundTick(slFillPrice, config.tickSize);
          result.closedAt = candle.minute;
          result.closeReason = result.tp1Filled ? 'TRAIL_SL' : 'SL';
          result.events.push(
            `SL_HIT_AT_${candle.minute}_PRICE_${result.closePrice}`,
          );
          break;
        } else if (setup.bias === 'SHORT' && high >= currentSL) {
          const slFillPrice = open >= currentSL ? open : currentSL;
          result.closed = true;
          result.closePrice = this.roundTick(slFillPrice, config.tickSize);
          result.closedAt = candle.minute;
          result.closeReason = result.tp1Filled ? 'TRAIL_SL' : 'SL';
          result.events.push(
            `SL_HIT_AT_${candle.minute}_PRICE_${result.closePrice}`,
          );
          break;
        }

        // Evaluar TP2
        if (setup.bias === 'LONG' && high >= setup.tp2) {
          const tp2FillPrice = open >= setup.tp2 ? open : setup.tp2;
          result.closed = true;
          result.closePrice = this.roundTick(tp2FillPrice, config.tickSize);
          result.closedAt = candle.minute;
          result.closeReason = 'TP2';
          result.events.push(
            `TP2_HIT_AT_${candle.minute}_PRICE_${result.closePrice}`,
          );
          break;
        } else if (setup.bias === 'SHORT' && low <= setup.tp2) {
          const tp2FillPrice = open <= setup.tp2 ? open : setup.tp2;
          result.closed = true;
          result.closePrice = this.roundTick(tp2FillPrice, config.tickSize);
          result.closedAt = candle.minute;
          result.closeReason = 'TP2';
          result.events.push(
            `TP2_HIT_AT_${candle.minute}_PRICE_${result.closePrice}`,
          );
          break;
        }
      }

      // ===== INVALIDACIÓN (solo para órdenes pendientes) =====
      if (!result.filled && invalidationLevel) {
        if (setup.bias === 'LONG' && low <= invalidationLevel) {
          result.closed = true;
          result.closeReason = 'CANCELLED_INVALIDATION';
          result.events.push(`INVALIDATED_AT_${candle.minute}`);
          break;
        } else if (setup.bias === 'SHORT' && high >= invalidationLevel) {
          result.closed = true;
          result.closeReason = 'CANCELLED_INVALIDATION';
          result.events.push(`INVALIDATED_AT_${candle.minute}`);
          break;
        }
      }
    }

    // ===== EXPIRACIÓN =====
    if (!result.filled) {
      result.closed = true;
      result.closeReason = 'EXPIRED';
      result.events.push('EXPIRED_NO_FILL');
    }

    // ===== CALCULAR PNL FINAL =====
    if (result.filled && result.closePrice) {
      result.pnl = this.calculateFinalPnL(
        fillPrice,
        result.closePrice,
        result.tp1Price,
        tp1Qty,
        tp2Qty,
        result.tp1Filled,
        setup.bias,
      );
    }

    return result;
  }

  private calculateUnrealizedPnL(
    entryPrice: number,
    currentPrice: number,
    qty: number,
    bias: 'LONG' | 'SHORT',
  ): number {
    const entryValue = entryPrice * qty;
    const currentValue = currentPrice * qty;
    return bias === 'LONG'
      ? currentValue - entryValue
      : entryValue - currentValue;
  }

  private calculateFinalPnL(
    fillPrice: number,
    closePrice: number,
    tp1Price: number | undefined,
    tp1Qty: number,
    tp2Qty: number,
    tp1Filled: boolean,
    bias: 'LONG' | 'SHORT',
  ): number {
    let totalPnL = 0;

    // PNL de TP1 si se ejecutó
    if (tp1Filled && tp1Price) {
      const tp1Value = tp1Price * tp1Qty - fillPrice * tp1Qty;
      totalPnL += bias === 'LONG' ? tp1Value : -tp1Value;
    }

    // PNL del remanente
    const remainingQty = tp1Filled ? tp2Qty : tp1Qty + tp2Qty;
    const remainingValue = closePrice * remainingQty - fillPrice * remainingQty;
    totalPnL += bias === 'LONG' ? remainingValue : -remainingValue;

    return totalPnL;
  }

  private roundTick(price: number, tickSize: number): number {
    return Math.round(price / tickSize) * tickSize;
  }
}
