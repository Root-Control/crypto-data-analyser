import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import * as WebSocket from 'ws';
import { TradingSetup } from '../schemas/trading-setup.schema';
import {
  SetupExecution,
  TradingConfig,
  BlockWindow,
  SetupState,
  CloseReason,
} from '../types/trading.types';
import { PredictionResult } from '../../../helpers/predictFromBlocks';

@Injectable()
export class TradingOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(TradingOrchestratorService.name);

  // WebSockets
  private wsMarkPrice: WebSocket;
  private wsKline: WebSocket;
  private wsBookTicker: WebSocket;
  private wsUserData: WebSocket;

  // Estado
  private activeSetups: Map<string, SetupExecution> = new Map();
  private currentMarkPrice = 0;
  private lastClosedKline: any = null;
  private currentSpread = 0;
  private currentInvalidation: any = null;
  private currentLevels: any = null;

  // Estados por setup para RETEST
  private retestStates: Map<
    string,
    {
      state: 'IDLE' | 'WAIT_TOUCH_BAND' | 'WAIT_NEXT_CLOSE' | 'ACTIVE';
      bandTouchedAt?: number;
      lastCheckedKline?: any;
    }
  > = new Map();

  // Control de exposición por bloque
  private filledSetupsPerBlock: Map<string, string[]> = new Map(); // blockId -> setupIds[]

  // Configuración
  private config: TradingConfig;

  constructor(
    @InjectModel(TradingSetup.name)
    private tradingSetupModel: Model<TradingSetup>,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
  ) {
    // Cargar configuración desde env con defaults
    this.config = {
      symbol: 'ETHUSDT',
      baseCapital: parseFloat(this.configService.get('TRADING_CAPITAL', '100')),
      leverage: parseInt(this.configService.get('TRADING_LEVERAGE', '10')),
      tp1Split: parseFloat(this.configService.get('TRADING_TP1_SPLIT', '0.5')),
      tp2Split: parseFloat(this.configService.get('TRADING_TP2_SPLIT', '0.5')),
      spreadMax: parseFloat(
        this.configService.get('TRADING_SPREAD_MAX', '0.0005'),
      ),
      slippageMax: parseFloat(
        this.configService.get('TRADING_SLIPPAGE_MAX', '0.0003'),
      ),
      volMax: parseFloat(this.configService.get('TRADING_VOL_MAX', '0.5')),
      rrMin: parseFloat(this.configService.get('TRADING_RR_MIN', '1.5')),
      throttleMinutes: parseInt(
        this.configService.get('TRADING_THROTTLE_MINUTES', '5'),
      ),
      strictRetest:
        this.configService.get('TRADING_STRICT_RETEST', 'true') === 'true',
      allowPyramiding:
        this.configService.get('TRADING_ALLOW_PYRAMIDING', 'false') === 'true',
      tickSize: parseFloat(this.configService.get('TRADING_TICK_SIZE', '0.01')),
      stepSize: parseFloat(
        this.configService.get('TRADING_STEP_SIZE', '0.001'),
      ),
    };
  }

  onModuleInit() {
    this.logger.log('🤖 Trading Orchestrator initialized');
    this.logger.log(`📊 Symbol: ${this.config.symbol}`);
    this.logger.log(
      `💰 Capital: $${this.config.baseCapital} | Leverage: ${this.config.leverage}x`,
    );
    this.logger.log(
      `⚙️ TP Split: ${this.config.tp1Split * 100}%/${this.config.tp2Split * 100}%`,
    );
    this.logger.log(`🎧 Escuchando evento: prediction.ready`);

    this.connectWebSockets();
  }

  @OnEvent('prediction.ready')
  async handlePredictionReady(payload: any) {
    this.logger.log('');
    this.logger.log('🎧 ==========================================');
    this.logger.log('🎧 EVENTO RECIBIDO: prediction.ready');
    this.logger.log(`🎧 Triggered by: ${payload.triggeredBy}`);
    this.logger.log('🎧 ==========================================');

    const { prediction, blockWindow } = payload;

    // Activar predicción automáticamente
    const result = await this.activatePrediction(prediction, blockWindow);

    if (result.success) {
      this.logger.log(
        '✅ Predicción activada automáticamente desde AnalyserService',
      );
    } else {
      this.logger.error('❌ Error activando predicción:', result.error);
    }
  }

  private connectWebSockets() {
    this.connectMarkPrice();
    this.connectKline();
    this.connectBookTicker();
  }

  private connectMarkPrice() {
    const url = `wss://fstream.binance.com/ws/${this.config.symbol.toLowerCase()}@markPrice@1s`;
    this.logger.log(`📡 Connecting to Mark Price: ${url}`);

    this.wsMarkPrice = new WebSocket(url);

    this.wsMarkPrice.on('open', () => {
      this.logger.log('✅ Mark Price WebSocket connected');
    });

    this.wsMarkPrice.on('message', (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      this.currentMarkPrice = parseFloat(msg.p);
      this.evaluateActiveSetups();
    });

    this.wsMarkPrice.on('error', (error) => {
      this.logger.error(`❌ Mark Price WS error: ${error.message}`);
    });

    this.wsMarkPrice.on('close', () => {
      this.logger.warn('⚠️ Mark Price WS closed. Reconnecting in 5s...');
      setTimeout(() => this.connectMarkPrice(), 5000);
    });
  }

  private connectKline() {
    const url = `wss://fstream.binance.com/ws/${this.config.symbol.toLowerCase()}@kline_1m`;
    this.logger.log(`📡 Connecting to Kline 1m: ${url}`);

    this.wsKline = new WebSocket(url);

    this.wsKline.on('open', () => {
      this.logger.log('✅ Kline 1m WebSocket connected');
    });

    this.wsKline.on('message', (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      const kline = msg.k;

      // Solo procesar velas cerradas
      if (kline.x) {
        this.lastClosedKline = kline;
        this.evaluateClosedKline(kline);
      }
    });

    this.wsKline.on('error', (error) => {
      this.logger.error(`❌ Kline WS error: ${error.message}`);
    });

    this.wsKline.on('close', () => {
      this.logger.warn('⚠️ Kline WS closed. Reconnecting in 5s...');
      setTimeout(() => this.connectKline(), 5000);
    });
  }

  private connectBookTicker() {
    const url = `wss://fstream.binance.com/ws/${this.config.symbol.toLowerCase()}@bookTicker`;
    this.logger.log(`📡 Connecting to BookTicker: ${url}`);

    this.wsBookTicker = new WebSocket(url);

    this.wsBookTicker.on('open', () => {
      this.logger.log('✅ BookTicker WebSocket connected');
      this.logger.log('');
    });

    this.wsBookTicker.on('message', (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      const bid = parseFloat(msg.b);
      const ask = parseFloat(msg.a);
      this.currentSpread = ((ask - bid) / bid) * 100;
    });

    this.wsBookTicker.on('error', (error) => {
      this.logger.error(`❌ BookTicker WS error: ${error.message}`);
    });

    this.wsBookTicker.on('close', () => {
      this.logger.warn('⚠️ BookTicker WS closed. Reconnecting in 5s...');
      setTimeout(() => this.connectBookTicker(), 5000);
    });
  }

  // ===== Métodos públicos =====

  /**
   * Activa una predicción para trading automático
   */
  async activatePrediction(
    prediction: PredictionResult,
    blockWindow: BlockWindow,
  ) {
    if (!prediction.ok || !prediction.bias || !prediction.entries) {
      this.logger.error('❌ Predicción inválida');
      return { success: false, error: 'Predicción inválida' };
    }

    const blockId = `${blockWindow.startDate}_${blockWindow.startTime}`;
    this.logger.log('');
    this.logger.log('🚀 ========================================');
    this.logger.log(`🚀 ACTIVANDO PREDICCIÓN: ${blockId}`);
    this.logger.log(`🚀 Bias: ${prediction.bias}`);
    this.logger.log(`🚀 Setups: ${prediction.entries.length}`);

    // Guardar invalidación y niveles
    this.currentInvalidation = prediction.invalidation;
    this.currentLevels = prediction.levels;

    if (this.currentInvalidation) {
      const invalidKey = Object.keys(this.currentInvalidation)[0];
      const invalidPrice = this.currentInvalidation[invalidKey];
      this.logger.log(`⚠️ Invalidación: ${invalidKey} = $${invalidPrice}`);
    }

    // Mostrar niveles
    if (prediction.levels) {
      this.logger.log(`📊 Niveles:`);
      this.logger.log(`   Key Level: $${prediction.levels.keyLevel}`);
      this.logger.log(
        `   Retest Band: [$${prediction.levels.retestBand[0]}, $${prediction.levels.retestBand[1]}]`,
      );
      this.logger.log(
        `   15m Range: $${prediction.levels.last15mLow} - $${prediction.levels.last15mHigh}`,
      );
      this.logger.log(`   Vol Median: ${prediction.levels.volMedian7Pct}%`);
    }

    this.logger.log('🚀 ========================================');

    const createdSetups: string[] = [];

    for (const entry of prediction.entries) {
      const setupId = `${blockId}_${entry.type}`;

      const setupExec: SetupExecution = {
        setupId,
        blockId,
        type: entry.type as any,
        state: 'IDLE',
        bias: prediction.bias,
        entry: entry.entry,
        sl: entry.sl,
        tp1: entry.tp1,
        tp2: entry.tp2,
        tp1Filled: false,
        createdAt: Date.now(),
        windowStart: blockWindow.startTs,
        windowEnd: blockWindow.endTs,
      };

      this.activeSetups.set(setupId, setupExec);

      // Inicializar estado RETEST si aplica
      if (setupExec.type.includes('RETEST')) {
        this.retestStates.set(setupId, { state: 'WAIT_TOUCH_BAND' });
      }

      // Guardar en BD
      await this.saveSetupToDB(setupExec);

      createdSetups.push(setupId);

      this.logger.log(`✅ Setup creado: ${setupId}`);
      this.logger.log(
        `   Entry: $${entry.entry} | SL: $${entry.sl} | TP1: $${entry.tp1} | TP2: $${entry.tp2}`,
      );

      this.eventEmitter.emit('setup.created', setupExec);
    }

    this.logger.log('');
    return { success: true, setupIds: createdSetups, blockId };
  }

  /**
   * Evalúa condiciones de entrada y gestiona setups activos
   */
  private evaluateActiveSetups() {
    if (!this.currentMarkPrice) return;

    const now = Date.now();

    this.activeSetups.forEach((setup, setupId) => {
      // Verificar ventana temporal
      if (now > setup.windowEnd) {
        this.expireSetup(setupId, 'EXPIRED_TIME');
        return;
      }

      // Verificar invalidación (ahora se maneja en evaluateClosedKline)
      // if (this.checkInvalidation(setup, low, high)) {
      //   this.cancelSetup(setupId, 'CANCELLED_INVALIDATION');
      //   return;
      // }

      // Evaluar según estado
      switch (setup.state) {
        case 'IDLE':
          this.evaluateIdleSetup(setup);
          break;
        case 'ARMED':
          this.evaluateArmedSetup(setup);
          break;
        case 'FILLED':
          this.evaluateFilledSetup(setup);
          break;
        case 'TP1_FILLED':
          this.evaluateTP1FilledSetup(setup);
          break;
      }
    });
  }

  private checkInvalidation(
    setup: SetupExecution,
    low: number,
    high: number,
  ): boolean {
    if (!this.currentInvalidation) return false;

    // LONG: cancelar si toca cancelIfShortTriggerFirst
    if (
      setup.bias === 'LONG' &&
      this.currentInvalidation.cancelIfShortTriggerFirst
    ) {
      if (low <= this.currentInvalidation.cancelIfShortTriggerFirst) {
        this.logger.warn(
          `⚠️ Invalidación LONG: Precio LOW ${low} <= ${this.currentInvalidation.cancelIfShortTriggerFirst}`,
        );
        this.closeSetup(setup, low, 'CANCELLED_INVALIDATION');
        return true;
      }
    }

    // SHORT: cancelar si toca cancelIfLongTriggerFirst
    if (
      setup.bias === 'SHORT' &&
      this.currentInvalidation.cancelIfLongTriggerFirst
    ) {
      if (high >= this.currentInvalidation.cancelIfLongTriggerFirst) {
        this.logger.warn(
          `⚠️ Invalidación SHORT: Precio HIGH ${high} >= ${this.currentInvalidation.cancelIfLongTriggerFirst}`,
        );
        this.closeSetup(setup, high, 'CANCELLED_INVALIDATION');
        return true;
      }
    }

    return false;
  }

  private evaluateIdleSetup(setup: SetupExecution) {
    // Evaluar condiciones según tipo
    if (setup.type.includes('MOMENTUM')) {
      this.evaluateMomentumCondition(setup);
    }
    // RETEST se evalúa en evaluateRetestConditions cuando cierra vela
  }

  private evaluateMomentumCondition(setup: SetupExecution) {
    if (setup.bias === 'LONG') {
      // Buy Stop: precio >= entry
      if (this.currentMarkPrice >= setup.entry) {
        this.armSetup(setup, 'MOMENTUM');
      }
    } else {
      // Sell Stop: precio <= entry
      if (this.currentMarkPrice <= setup.entry) {
        this.armSetup(setup, 'MOMENTUM');
      }
    }
  }

  /**
   * Procesa una vela cerrada (OHLC completo)
   */
  private evaluateClosedKline(kline: any) {
    const open = parseFloat(kline.o);
    const high = parseFloat(kline.h);
    const low = parseFloat(kline.l);
    const close = parseFloat(kline.c);
    const candleTs = kline.T; // Timestamp de cierre
    const isGreen = close > open;
    const isRed = close < open;

    // Procesar cada setup activo
    let velaIndex = 0; // Índice relativo de vela dentro del bloque
    this.activeSetups.forEach((setup) => {
      velaIndex++;
      // 1) Invalidación para órdenes PENDIENTES (solo si NO está filled)
      if (!setup.fillPrice && setup.state === 'IDLE') {
        if (this.checkInvalidation(setup, low, high)) {
          return; // Setup cancelado
        }
      }

      // 2) FSM RETEST (solo si es RETEST y no está filled)
      if (setup.type.includes('RETEST') && !setup.fillPrice) {
        const retestState = this.retestStates.get(setup.setupId);
        if (retestState) {
          // WAIT_TOUCH_BAND → verificar si toca banda
          if (
            retestState.state === 'WAIT_TOUCH_BAND' &&
            this.currentLevels?.retestBand
          ) {
            const [bandLo, bandHi] = this.currentLevels.retestBand;
            if (low <= bandHi && high >= bandLo) {
              retestState.state = 'WAIT_NEXT_CLOSE';
              retestState.lastCheckedKline = kline;
              this.logger.log(
                `📍 ${setup.setupId}: Banda tocada, esperando siguiente vela`,
              );
            }
          }

          // WAIT_NEXT_CLOSE → verificar color de vela
          else if (retestState.state === 'WAIT_NEXT_CLOSE') {
            if (setup.type === 'RETEST_LIMIT_AFTER_GREEN' && isGreen) {
              retestState.state = 'ACTIVE';
              setup.orderPlacementTs = candleTs; // Marcar placement timestamp
              this.logger.log(
                `🟢 ${setup.setupId}: Confirmación GREEN, orden LIMIT activa`,
              );
            } else if (setup.type === 'RETEST_LIMIT_AFTER_RED' && isRed) {
              retestState.state = 'ACTIVE';
              setup.orderPlacementTs = candleTs; // Marcar placement timestamp
              this.logger.log(
                `🔴 ${setup.setupId}: Confirmación RED, orden LIMIT activa`,
              );
            }
          }
        }
      }

      // 3) FILL de órdenes (MOMENTUM siempre, RETEST solo si ACTIVE)
      if (!setup.fillPrice && setup.state === 'IDLE') {
        const canRetestFill = setup.type.includes('RETEST')
          ? this.retestStates.get(setup.setupId)?.state === 'ACTIVE'
          : true;

        if (canRetestFill) {
          // Control de exposición: maxConcurrent=1 por bloque
          const blockFilled =
            this.filledSetupsPerBlock.get(setup.blockId) || [];
          if (blockFilled.length > 0) {
            // Ya hay un setup filled en este bloque, no llenar más
            return;
          }

          this.tryFillSetup(setup, open, high, low, close, velaIndex);
        }
      }

      // 4) Actualizar MAE/MFE para posiciones FILLED
      if (
        setup.fillPrice &&
        (setup.state === 'FILLED' || setup.state === 'TP1_FILLED')
      ) {
        this.updateMAEMFE(setup, open, high, low, close);
      }

      // 5) Gestión de posición FILLED
      if (setup.fillPrice && setup.state === 'FILLED') {
        this.evaluateTP1(setup, open, high, low, close, velaIndex);
        this.evaluateSL(setup, open, high, low, close);
        this.evaluateTP2(setup, open, high, low, close);
      }

      // 6) Gestión post-TP1
      if (setup.fillPrice && setup.state === 'TP1_FILLED') {
        this.evaluateSL(setup, open, high, low, close);
        this.evaluateTP2(setup, open, high, low, close);
      }

      // 7) Expiración (fuera del window)
      if (!setup.fillPrice && Date.now() >= setup.windowEnd) {
        this.closeSetup(setup, close, 'EXPIRED_TIME');
      }
    });
  }

  /**
   * Actualiza MAE/MFE basado en OHLC de la vela actual
   */
  private updateMAEMFE(
    setup: SetupExecution,
    open: number,
    high: number,
    low: number,
    close: number,
  ) {
    if (!setup.fillPrice || !setup.quantity) return;

    const fillPrice = setup.fillPrice;

    if (setup.bias === 'LONG') {
      // MAE: peor caso (low más bajo desde fill)
      const adversePnL = (low - fillPrice) * setup.quantity;
      if (!setup.mae || adversePnL < setup.mae) {
        setup.mae = adversePnL;
      }

      // MFE: mejor caso (high más alto desde fill)
      const favorablePnL = (high - fillPrice) * setup.quantity;
      if (!setup.mfe || favorablePnL > setup.mfe) {
        setup.mfe = favorablePnL;
      }
    } else {
      // SHORT
      // MAE: peor caso (high más alto desde fill)
      const adversePnL = (fillPrice - high) * setup.quantity;
      if (!setup.mae || adversePnL < setup.mae) {
        setup.mae = adversePnL;
      }

      // MFE: mejor caso (low más bajo desde fill)
      const favorablePnL = (fillPrice - low) * setup.quantity;
      if (!setup.mfe || favorablePnL > setup.mfe) {
        setup.mfe = favorablePnL;
      }
    }
  }

  /**
   * Intenta llenar una orden según OHLC y tipo
   */
  private tryFillSetup(
    setup: SetupExecution,
    open: number,
    high: number,
    low: number,
    close: number,
    velaIndex: number,
  ) {
    let fillPrice: number | null = null;

    // MOMENTUM BUY STOP
    if (setup.type === 'MOMENTUM_BUY_STOP' && high >= setup.entry) {
      fillPrice = open >= setup.entry ? open : setup.entry;
    }

    // MOMENTUM SELL STOP
    if (setup.type === 'MOMENTUM_SELL_STOP' && low <= setup.entry) {
      fillPrice = open <= setup.entry ? open : setup.entry;
    }

    // RETEST BUY LIMIT
    if (
      setup.type === 'RETEST_LIMIT_AFTER_GREEN' &&
      low <= setup.entry &&
      setup.entry <= high
    ) {
      fillPrice = open <= setup.entry ? open : setup.entry;
    }

    // RETEST SELL LIMIT
    if (
      setup.type === 'RETEST_LIMIT_AFTER_RED' &&
      low <= setup.entry &&
      setup.entry <= high
    ) {
      fillPrice = open >= setup.entry ? open : setup.entry;
    }

    if (fillPrice !== null) {
      this.fillEntry(setup, fillPrice, velaIndex);
    }
  }

  /**
   * Evalúa TP1 (con OHLC+gap y evita re-evaluación en misma vela)
   */
  private evaluateTP1(
    setup: SetupExecution,
    open: number,
    high: number,
    low: number,
    close: number,
    velaIndex: number,
  ) {
    if (setup.tp1Filled) return;

    // Evitar re-evaluación en la misma vela donde ya tocó TP1
    if (setup.tp1VelaIndex !== undefined && setup.tp1VelaIndex === velaIndex) {
      return;
    }

    let tp1FillPrice: number | null = null;

    // LONG: TP1 cuando high >= tp1 (usar OHLC + gap)
    if (setup.bias === 'LONG' && high >= setup.tp1) {
      tp1FillPrice = open >= setup.tp1 ? open : setup.tp1;
    }
    // SHORT: TP1 cuando low <= tp1 (usar OHLC + gap)
    else if (setup.bias === 'SHORT' && low <= setup.tp1) {
      tp1FillPrice = open <= setup.tp1 ? open : setup.tp1;
    }

    if (tp1FillPrice !== null) {
      setup.tp1Filled = true;
      setup.tp1Price = this.roundPrice(tp1FillPrice);
      setup.tp1Time = Date.now();
      setup.tp1VelaIndex = velaIndex; // Marcar vela donde tocó TP1
      setup.state = 'TP1_FILLED';

      // Mover SL a breakeven mejorado (± 0.02%)
      const newSL =
        setup.fillPrice! * (setup.bias === 'LONG' ? 0.9998 : 1.0002);
      setup.sl = this.roundPrice(newSL);

      this.logger.log(
        `✅ TP1 HIT: ${setup.setupId} @ $${setup.tp1Price.toFixed(2)} | SL moved to $${setup.sl.toFixed(2)}`,
      );
      this.updateSetupInDB(setup);
    }
  }

  /**
   * Evalúa SL
   */
  private evaluateSL(
    setup: SetupExecution,
    open: number,
    high: number,
    low: number,
    close: number,
  ) {
    let slFillPrice: number | null = null;

    if (setup.bias === 'LONG' && low <= setup.sl) {
      slFillPrice = open <= setup.sl ? open : setup.sl;
    } else if (setup.bias === 'SHORT' && high >= setup.sl) {
      slFillPrice = open >= setup.sl ? open : setup.sl;
    }

    if (slFillPrice !== null) {
      const reason = setup.tp1Filled ? 'TRAIL_SL' : 'SL';
      this.closeSetup(setup, slFillPrice, reason);
    }
  }

  /**
   * Evalúa TP2
   */
  private evaluateTP2(
    setup: SetupExecution,
    open: number,
    high: number,
    low: number,
    close: number,
  ) {
    let tp2FillPrice: number | null = null;

    if (setup.bias === 'LONG' && high >= setup.tp2) {
      tp2FillPrice = open >= setup.tp2 ? open : setup.tp2;
    } else if (setup.bias === 'SHORT' && low <= setup.tp2) {
      tp2FillPrice = open <= setup.tp2 ? open : setup.tp2;
    }

    if (tp2FillPrice !== null) {
      this.closeSetup(setup, tp2FillPrice, 'TP2');
    }
  }

  private armSetup(setup: SetupExecution, reason: string) {
    setup.state = 'ARMED';

    this.logger.log(`🔫 Setup ARMED: ${setup.setupId} (${reason})`);
    this.logger.log(
      `   Entry: $${setup.entry} | Current: $${this.currentMarkPrice}`,
    );

    this.eventEmitter.emit('setup.armed', setup);

    // El fill ahora se maneja en evaluateClosedKline con tryFillSetup
  }

  private fillEntry(
    setup: SetupExecution,
    fillPrice: number,
    velaIndex: number,
  ) {
    setup.state = 'FILLED';
    setup.fillPrice = this.roundPrice(fillPrice);
    setup.filledAt = Date.now();
    setup.entryTime = Date.now();

    // Calcular cantidad basada en capital y leverage
    const positionValue = this.config.baseCapital * this.config.leverage;
    setup.quantity = this.roundStep(positionValue / fillPrice);
    setup.tp1Quantity = this.roundStep(setup.quantity * this.config.tp1Split);
    setup.tp2Quantity = this.roundStep(setup.quantity * this.config.tp2Split);

    // Inicializar MAE/MFE en 0
    setup.mae = 0;
    setup.mfe = 0;

    // Registrar en control de exposición
    const blockFilled = this.filledSetupsPerBlock.get(setup.blockId) || [];
    blockFilled.push(setup.setupId);
    this.filledSetupsPerBlock.set(setup.blockId, blockFilled);

    this.logger.log(`✅ Setup FILLED: ${setup.setupId}`);
    this.logger.log(
      `   Fill Price: $${setup.fillPrice.toFixed(2)} | Qty: ${setup.quantity}`,
    );
    this.logger.log(
      `   TP1: $${setup.tp1} (${setup.tp1Quantity}) | TP2: $${setup.tp2} (${setup.tp2Quantity})`,
    );
    this.logger.log(`   SL: $${setup.sl}`);

    this.eventEmitter.emit('setup.filled', setup);
    this.updateSetupInDB(setup);
  }

  private evaluateArmedSetup(setup: SetupExecution) {
    // En producción, aquí verificarías el estado de la orden
    // Por ahora, auto-fill en evaluateMomentumCondition
  }

  private evaluateFilledSetup(setup: SetupExecution) {
    // Este método ya no se usa, la evaluación se hace en evaluateClosedKline
    // TODO: Eliminar este método después de confirmar que el nuevo sistema funciona
  }

  private evaluateTP1FilledSetup(setup: SetupExecution) {
    // Este método ya no se usa, la evaluación se hace en evaluateClosedKline
    // TODO: Eliminar este método después de confirmar que el nuevo sistema funciona
  }

  private fillTP1(setup: SetupExecution) {
    setup.tp1Filled = true;
    setup.tp1Time = Date.now();
    setup.state = 'TP1_FILLED';

    // Mover SL a breakeven mejorado
    if (setup.bias === 'LONG') {
      setup.trailingSL = this.roundTick(setup.entry * (1 - 0.0002)); // entry - 0.02%
    } else {
      setup.trailingSL = this.roundTick(setup.entry * (1 + 0.0002)); // entry + 0.02%
    }

    const tp1PnL = this.calculatePnL(
      setup,
      setup.tp1,
      false,
      setup.tp1Quantity,
    );

    this.logger.log(`🎯 TP1 FILLED: ${setup.setupId}`);
    this.logger.log(`   TP1: $${setup.tp1} | Qty: ${setup.tp1Quantity}`);
    this.logger.log(`   Trailing SL movido a: $${setup.trailingSL}`);
    this.logger.log(`   PNL parcial: $${tp1PnL.toFixed(2)}`);

    this.eventEmitter.emit('setup.tp1_filled', { setup, pnl: tp1PnL });
    this.updateSetupInDB(setup);
  }

  private closeSetup(
    setup: SetupExecution,
    closePrice: number,
    reason: CloseReason,
  ) {
    setup.state = 'CLOSED';
    setup.closeTime = Date.now();
    setup.closeReason = reason;

    const finalPnL = this.calculateFinalPnL(setup, closePrice);
    setup.pnl = finalPnL;

    this.logger.log(`🔴 Setup CLOSED: ${setup.setupId}`);
    this.logger.log(`   Reason: ${reason}`);
    this.logger.log(
      `   Entry: $${setup.fillPrice || setup.entry} | Exit: $${closePrice.toFixed(2)}`,
    );
    this.logger.log(`   PNL: $${finalPnL.toFixed(2)}`);
    this.logger.log(
      `   MAE: $${(setup.mae || 0).toFixed(2)} | MFE: $${(setup.mfe || 0).toFixed(2)}`,
    );

    this.eventEmitter.emit('setup.closed', {
      setup,
      pnl: finalPnL,
      reason,
    });

    this.updateSetupInDB(setup);
    this.activeSetups.delete(setup.setupId);

    // Limpiar del control de exposición
    const blockFilled = this.filledSetupsPerBlock.get(setup.blockId);
    if (blockFilled) {
      const index = blockFilled.indexOf(setup.setupId);
      if (index > -1) {
        blockFilled.splice(index, 1);
      }
      if (blockFilled.length === 0) {
        this.filledSetupsPerBlock.delete(setup.blockId);
      }
    }
  }

  private cancelSetup(setupId: string, reason: string) {
    const setup = this.activeSetups.get(setupId);
    if (!setup) return;

    setup.state = 'CANCELLED';
    setup.closeTime = Date.now();
    setup.closeReason = reason as CloseReason;

    this.logger.log(`⛔ Setup CANCELLED: ${setupId} - ${reason}`);

    this.eventEmitter.emit('setup.cancelled', { setup, reason });
    this.updateSetupInDB(setup);
    this.activeSetups.delete(setupId);
  }

  private expireSetup(setupId: string, reason: string) {
    const setup = this.activeSetups.get(setupId);
    if (!setup) return;

    setup.state = 'EXPIRED';
    setup.closeTime = Date.now();
    setup.closeReason = reason as CloseReason;

    this.logger.log(`⏱️ Setup EXPIRED: ${setupId}`);

    this.eventEmitter.emit('setup.expired', { setup, reason });
    this.updateSetupInDB(setup);
    this.activeSetups.delete(setupId);
  }

  // ===== Cálculos =====

  private calculatePnL(
    setup: SetupExecution,
    exitPrice: number,
    onlyRemaining = false,
    customQty?: number,
  ): number {
    const qty =
      customQty || (onlyRemaining ? setup.tp2Quantity : setup.quantity);
    if (!qty) return 0;

    const entryValue = setup.entry * qty;
    const exitValue = exitPrice * qty;

    return setup.bias === 'LONG'
      ? exitValue - entryValue
      : entryValue - exitValue;
  }

  private calculateFinalPnL(setup: SetupExecution, exitPrice: number): number {
    let totalPnL = 0;

    // PNL de TP1 si se ejecutó
    if (setup.tp1Filled && setup.tp1Quantity) {
      totalPnL += this.calculatePnL(setup, setup.tp1, false, setup.tp1Quantity);
    }

    // PNL del remanente
    const remainingQty = setup.tp1Filled ? setup.tp2Quantity : setup.quantity;
    if (remainingQty) {
      totalPnL += this.calculatePnL(setup, exitPrice, false, remainingQty);
    }

    return totalPnL;
  }

  // ===== Helpers =====

  private roundTick(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  private roundStep(qty: number): number {
    return Math.round(qty / this.config.stepSize) * this.config.stepSize;
  }

  private roundPrice(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  // ===== Base de datos =====

  private async saveSetupToDB(setup: SetupExecution) {
    try {
      await this.tradingSetupModel.create({
        setupId: setup.setupId,
        blockId: setup.blockId,
        pair: this.config.symbol,
        type: setup.type,
        state: setup.state,
        bias: setup.bias,
        entry: setup.entry,
        sl: setup.sl,
        tp1: setup.tp1,
        tp2: setup.tp2,
        tp1Filled: setup.tp1Filled,
        trailingSL: setup.trailingSL,
        quantity: setup.quantity,
        tp1Quantity: setup.tp1Quantity,
        tp2Quantity: setup.tp2Quantity,
        entryTime: setup.entryTime,
        tp1Time: setup.tp1Time,
        closeTime: setup.closeTime,
        closeReason: setup.closeReason,
        pnl: setup.pnl,
        mae: setup.mae,
        mfe: setup.mfe,
        windowStart: setup.windowStart,
        windowEnd: setup.windowEnd,
        createdAt: setup.createdAt,
      });
    } catch (error) {
      this.logger.error(`Error guardando setup en BD: ${error.message}`);
    }
  }

  private async updateSetupInDB(setup: SetupExecution) {
    try {
      await this.tradingSetupModel.updateOne(
        { setupId: setup.setupId },
        {
          $set: {
            state: setup.state,
            tp1Filled: setup.tp1Filled,
            trailingSL: setup.trailingSL,
            quantity: setup.quantity,
            tp1Quantity: setup.tp1Quantity,
            tp2Quantity: setup.tp2Quantity,
            entryTime: setup.entryTime,
            tp1Time: setup.tp1Time,
            closeTime: setup.closeTime,
            closeReason: setup.closeReason,
            pnl: setup.pnl,
            mae: setup.mae,
            mfe: setup.mfe,
          },
        },
      );
    } catch (error) {
      this.logger.error(`Error actualizando setup en BD: ${error.message}`);
    }
  }

  // ===== Getters =====

  getActiveSetupsCount(): number {
    return this.activeSetups.size;
  }

  getCurrentPrice(): number {
    return this.currentMarkPrice;
  }

  getConfig(): TradingConfig {
    return { ...this.config };
  }
}
