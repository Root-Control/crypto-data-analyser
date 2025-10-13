export type SetupState =
  | 'IDLE'
  | 'ARMED'
  | 'FILLED'
  | 'TP1_FILLED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'EXPIRED';

export type SetupType =
  | 'MOMENTUM_BUY_STOP'
  | 'MOMENTUM_SELL_STOP'
  | 'RETEST_LIMIT_AFTER_GREEN'
  | 'RETEST_LIMIT_AFTER_RED';

export type CloseReason =
  | 'TP2'
  | 'SL'
  | 'TRAIL_SL'
  | 'CANCELLED_INVALIDATION'
  | 'EXPIRED_TIME'
  | 'TIMEOUT'
  | 'ERROR';

export interface OrderInfo {
  orderId?: string;
  clientOrderId?: string;
  price: number;
  quantity: number;
  filledPrice?: number;
  filledQuantity?: number;
  timestamp: number;
  status: string;
}

export interface SetupExecution {
  setupId: string;
  blockId: string;
  type: SetupType;
  state: SetupState;
  bias: 'LONG' | 'SHORT';

  // Niveles
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;

  // Órdenes
  entryOrder?: OrderInfo;
  slOrder?: OrderInfo;
  tp1Order?: OrderInfo;
  tp2Order?: OrderInfo;

  // Gestión
  tp1Filled: boolean;
  trailingSL?: number;
  quantity?: number;
  tp1Quantity?: number;
  tp2Quantity?: number;

  // Precios reales de ejecución
  fillPrice?: number; // Precio real de entrada
  tp1Price?: number; // Precio real de TP1
  orderPlacementTs?: number; // Timestamp cuando se activa la orden (especial para RETEST)

  // Métricas
  entryTime?: number;
  filledAt?: number; // Timestamp del fill
  tp1Time?: number;
  tp1VelaIndex?: number; // Índice de vela donde tocó TP1 (evitar re-evaluación en misma vela)
  closeTime?: number;
  closeReason?: CloseReason;
  pnl?: number;
  mae?: number; // Maximum Adverse Excursion
  mfe?: number; // Maximum Favorable Excursion

  // Metadata
  createdAt: number;
  windowStart: number;
  windowEnd: number;
}

export interface TradingConfig {
  symbol: string;
  baseCapital: number;
  leverage: number;
  tp1Split: number; // 0.5 = 50% en TP1, 50% en TP2
  tp2Split: number;

  // Límites
  spreadMax: number;
  slippageMax: number;
  volMax: number;
  rrMin: number; // Risk/Reward mínimo

  // Control
  throttleMinutes: number;
  strictRetest: boolean; // true = exige siguiente vela, false = tolerante
  allowPyramiding: boolean;

  // Exchange info
  tickSize: number;
  stepSize: number;
}

export interface BlockWindow {
  startDate: string;
  startTime: string;
  startTs: number;
  endTs: number;
}
