/**
 * marketMinute.ts
 * Motor de análisis minuto a minuto para trading (ETHUSDT 1m)
 * Calcula: fluct, maxPct, minPct, seq, volumen, VWAP, delta, imbalance
 * Funciones puras, deterministas, sin dependencias externas
 */

// ===== TYPES & INTERFACES =====

export type Seq = 'HL' | 'LH' | 'H-' | '-L';
export type FirstMove = 'up' | 'down';
export type MeanRevertBias = 'up' | 'down';

export interface NormalizedTick {
  px: number;
  vol: number;
  ts: number;
  isBuyerMaker?: boolean; // true = agresión sell
}

export interface CandleInput {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyBaseVolume?: number;
}

export interface MinuteState {
  minuteStartTs: number;
  openPx: number;
  highPx: number;
  lowPx: number;
  closePx: number;
  tHighSec?: number;
  tLowSec?: number;
  highSet: boolean;
  lowSet: boolean;

  // Volume metrics
  tickVol: number;
  buyVol: number;
  sellVol: number;
  vwapNum: number;
  vwapDen: number;
  tickCount: number; // Contador de ticks (útil para filtros)

  // Flow signals
  firstMove?: FirstMove;

  // Data quality counters
  invalidTickCount: number;
  outOfWindowTickCount: number;
}

export interface ConfidenceFlags {
  bullish: boolean;
  bearish: boolean;
  climax: boolean;
  meanRevertBias?: MeanRevertBias;
}

export interface MinuteMetrics {
  tsStart: number;
  open: number;
  high: number;
  low: number;
  close: number;
  fluct: number;
  maxPct: number;
  minPct: number;
  seq: Seq;

  // Volume
  tickVol: number;
  buyVol: number;
  sellVol: number;
  delta: number;
  imbalance: number;
  vwap?: number;
  tickCount: number; // Número de ticks procesados

  // Signals
  firstMove?: FirstMove;
  flags: ConfidenceFlags;

  // Data quality metrics (opcional)
  invalidTickCount?: number; // Ticks con px/vol inválidos
  outOfWindowTickCount?: number; // Ticks fuera de ventana [minuteStartTs, minuteStartTs+60s)
}

export interface EngineParams {
  readonly imbalanceBull: number;
  readonly imbalanceBear: number;
  readonly climaxLookback: number;
  readonly climaxPercentile: number;
  readonly vwapConfirm: 'closeOverVWAP' | 'none';
  readonly vwapEpsilonPct: number; // Tolerancia para confirmación VWAP (% sobre close)
  readonly numericEpsilon: number;
  readonly meanRevertFluctThreshPct: number; // Umbral de fluct para activar meanRevert
  readonly unknownSideHandling: 'ignore' | 'split'; // Cómo tratar ticks sin isBuyerMaker
}

export interface RollingStats {
  readonly window: readonly number[];
  readonly maxSize: number;
}

// ===== DEFAULT PARAMETERS =====

export const DEFAULT_PARAMS = Object.freeze({
  imbalanceBull: 0.2,
  imbalanceBear: -0.2,
  climaxLookback: 60,
  climaxPercentile: 0.8,
  vwapConfirm: 'closeOverVWAP' as const,
  vwapEpsilonPct: 0.01, // 0.01% de tolerancia para confirmación VWAP
  numericEpsilon: 1e-12,
  meanRevertFluctThreshPct: 0.5,
  unknownSideHandling: 'split' as const, // Por defecto: dividir 50/50
} satisfies EngineParams);

/**
 * Valida parámetros de configuración (dev-time)
 * Lanza error si hay valores fuera de rango
 *
 * @param params - parámetros a validar
 * @throws Error si algún parámetro es inválido
 */
export function validateParams(params: EngineParams): void {
  if (params.climaxLookback <= 0) {
    throw new Error(
      `climaxLookback debe ser > 0, recibido: ${params.climaxLookback}`,
    );
  }
  if (params.climaxPercentile < 0 || params.climaxPercentile > 1) {
    throw new Error(
      `climaxPercentile debe estar en [0,1], recibido: ${params.climaxPercentile}`,
    );
  }
  if (params.vwapEpsilonPct < 0) {
    throw new Error(
      `vwapEpsilonPct debe ser >= 0, recibido: ${params.vwapEpsilonPct}`,
    );
  }
  if (params.numericEpsilon <= 0) {
    throw new Error(
      `numericEpsilon debe ser > 0, recibido: ${params.numericEpsilon}`,
    );
  }
  if (params.meanRevertFluctThreshPct < 0) {
    throw new Error(
      `meanRevertFluctThreshPct debe ser >= 0, recibido: ${params.meanRevertFluctThreshPct}`,
    );
  }
  if (params.imbalanceBull <= -1 || params.imbalanceBull > 1) {
    throw new Error(
      `imbalanceBull debe estar en (-1,1], recibido: ${params.imbalanceBull}`,
    );
  }
  if (params.imbalanceBear < -1 || params.imbalanceBear >= 1) {
    throw new Error(
      `imbalanceBear debe estar en [-1,1), recibido: ${params.imbalanceBear}`,
    );
  }
  if (params.imbalanceBull <= params.imbalanceBear) {
    throw new Error(
      `imbalanceBull debe ser > imbalanceBear, recibido: ${params.imbalanceBull} <= ${params.imbalanceBear}`,
    );
  }
}

// ===== PRIVATE HELPERS =====

/**
 * Safe division con epsilon configurable
 * Usa este método en TODOS los cálculos numéricos para epsilon consistente
 */
function safeDivEps(a: number, b: number, eps = 1e-12, fallback = 0): number {
  if (!isFiniteNumber(b) || Math.abs(b) < eps) return fallback;
  const result = a / b;
  return isFiniteNumber(result) ? result : fallback;
}

/**
 * Verifica que un número sea finito
 */
function isFiniteNumber(x: number): boolean {
  return typeof x === 'number' && isFinite(x) && !isNaN(x);
}

/**
 * Clamp un valor entre min y max
 *
 * Manejo especial de NaN/Infinity:
 * - Si x no es finito Y 0 ∈ [min, max] → retorna 0 (neutral)
 * - Si x no es finito Y 0 ∉ [min, max] → retorna min (conservador)
 *
 * Ejemplo: clamp(NaN, -1, 1) → 0 (neutral para imbalance)
 *          clamp(NaN, 1, 10) → 1 (min cuando 0 no está en rango)
 */
function clamp(x: number, min: number, max: number): number {
  if (!isFiniteNumber(x)) {
    return min <= 0 && 0 <= max ? 0 : min;
  }
  return Math.max(min, Math.min(max, x));
}

/**
 * Calcula segundos dentro del minuto
 * Cap a [0, 59] por seguridad en ticks en el borde del minuto
 */
function secondsWithinMinute(ts: number, minuteStartTs: number): number {
  const sec = Math.floor((ts - minuteStartTs) / 1000);
  if (!isFiniteNumber(sec)) return 0;
  return Math.min(59, Math.max(0, sec));
}

/**
 * Calcula percentil de un array
 * Valida p entre [0, 1]
 */
function percentile(arr: readonly number[], p: number): number {
  if (arr.length === 0) return 0;
  const pp = Math.max(0, Math.min(1, p)); // Clamp p a [0, 1]
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * pp) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Formatea número para logging con redondeo determinista
 * Exportada para reutilización en logs de usuario
 * @param n - número a formatear (puede ser undefined)
 * @param p - decimales (default: 4)
 * @returns string formateado o undefined
 */
export function fmt(n: number | undefined, p = 4): string | undefined {
  if (n === undefined) return undefined;
  if (!isFiniteNumber(n)) return 'N/A';
  return n.toFixed(p);
}

/**
 * Assert exhaustividad para switch/if exhaustivos
 * @param x - valor que nunca debería ocurrir
 */
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

/**
 * Predicado: evalúa si las métricas son bullish
 * @param imbalance - imbalance calculado
 * @param close - precio de cierre
 * @param vwap - VWAP (opcional)
 * @param params - parámetros del engine
 * @returns true si cumple condición bullish
 */
function isBullish(
  imbalance: number,
  close: number,
  vwap: number | undefined,
  params: EngineParams,
): boolean {
  if (imbalance < params.imbalanceBull) return false;

  if (params.vwapConfirm === 'none') return true;

  if (vwap === undefined) return false;

  // Tolerancia: close debe estar vwapEpsilonPct% por encima de vwap
  const threshold = vwap * (1 + params.vwapEpsilonPct / 100);
  return close >= threshold;
}

/**
 * Predicado: evalúa si las métricas son bearish
 * @param imbalance - imbalance calculado
 * @param close - precio de cierre
 * @param vwap - VWAP (opcional)
 * @param params - parámetros del engine
 * @returns true si cumple condición bearish
 */
function isBearish(
  imbalance: number,
  close: number,
  vwap: number | undefined,
  params: EngineParams,
): boolean {
  if (imbalance > params.imbalanceBear) return false;

  if (params.vwapConfirm === 'none') return true;

  if (vwap === undefined) return false;

  // Tolerancia: close debe estar vwapEpsilonPct% por debajo de vwap
  const threshold = vwap * (1 - params.vwapEpsilonPct / 100);
  return close <= threshold;
}

// ===== PUBLIC API =====

/**
 * Inicia un nuevo minuto
 */
export function startMinute(
  openPx: number,
  minuteStartTs: number,
): MinuteState {
  return {
    minuteStartTs,
    openPx,
    highPx: openPx,
    lowPx: openPx,
    closePx: openPx,
    highSet: false,
    lowSet: false,
    tickVol: 0,
    buyVol: 0,
    sellVol: 0,
    vwapNum: 0,
    vwapDen: 0,
    tickCount: 0,
    invalidTickCount: 0,
    outOfWindowTickCount: 0,
  };
}

/**
 * Ingesta un tick normalizado y actualiza el estado
 *
 * Includes:
 * - Out-of-window guard (ignora ticks fuera de [minuteStartTs, minuteStartTs+60s))
 * - Invalid data guard (px/vol NaN/Inf)
 * - Fast-path para px === openPx (micro-opt)
 */
export function ingestTick(
  st: MinuteState,
  t: NormalizedTick,
  params: EngineParams = DEFAULT_PARAMS,
): MinuteState {
  const newState = { ...st };

  // Guard 1: Validar datos numéricos
  if (!isFiniteNumber(t.px) || !isFiniteNumber(t.vol) || t.vol < 0) {
    newState.invalidTickCount += 1;
    return newState;
  }

  // Guard 2: Ticks fuera de ventana [minuteStartTs, minuteStartTs + 60_000)
  const minuteEndTs = st.minuteStartTs + 60_000;
  if (t.ts < st.minuteStartTs || t.ts >= minuteEndTs) {
    newState.outOfWindowTickCount += 1;
    return newState;
  }

  const eps = params.numericEpsilon;

  // Incrementar contador de ticks válidos
  newState.tickCount += 1;

  // Actualizar close
  newState.closePx = t.px;

  // Fast-path: Si precio === open, no hay firstMove
  if (t.px === newState.openPx) {
    // No detectar firstMove (mantener estado actual)
  } else if (!newState.firstMove && Math.abs(t.px - newState.openPx) > eps) {
    // Detectar firstMove con epsilon
    newState.firstMove = t.px > newState.openPx ? 'up' : 'down';
  }

  // Actualizar high
  if (t.px > newState.highPx) {
    newState.highPx = t.px;
    if (!newState.highSet) {
      newState.tHighSec = secondsWithinMinute(t.ts, newState.minuteStartTs);
      newState.highSet = true;
    }
  }

  // Actualizar low
  if (t.px < newState.lowPx) {
    newState.lowPx = t.px;
    if (!newState.lowSet) {
      newState.tLowSec = secondsWithinMinute(t.ts, newState.minuteStartTs);
      newState.lowSet = true;
    }
  }

  // Volumen: isBuyerMaker=true → agresión sell
  newState.tickVol += t.vol;
  if (t.isBuyerMaker === true) {
    newState.sellVol += t.vol;
  } else if (t.isBuyerMaker === false) {
    newState.buyVol += t.vol;
  } else {
    // isBuyerMaker === undefined → usar unknownSideHandling
    if (params.unknownSideHandling === 'split') {
      newState.buyVol += t.vol / 2;
      newState.sellVol += t.vol / 2;
    }
    // Si 'ignore', no agregar a buyVol/sellVol (solo a tickVol)
  }

  // VWAP acumulado
  newState.vwapNum += t.px * t.vol;
  newState.vwapDen += t.vol;

  return newState;
}

/**
 * Ingesta una vela 1m (fallback sin ticks)
 *
 * ⚠️ IMPORTANTE: Este método asume que NO hubo ticks previos.
 * Solo llamarlo cuando inicie el minuto con kline (sin aggTrade).
 *
 * Comportamiento:
 * - Setea OHLC desde kline
 * - NO inventa tHighSec/tLowSec
 * - Resetea highSet/lowSet a false
 * - Estima buyVol/sellVol (50/50 o takerBuyBaseVolume)
 * - VWAP aproximado: (H+L+C)/3
 * - firstMove heurístico: close > open → 'up'
 */
export function ingestCandle(
  st: MinuteState,
  candle: CandleInput,
  params: EngineParams = DEFAULT_PARAMS,
): MinuteState {
  const newState = { ...st };
  const eps = params.numericEpsilon;

  // Validación de entrada (blindaje total)
  const ohlcValid = [
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
  ].every(isFiniteNumber);

  if (!ohlcValid || candle.volume < 0) {
    return newState; // Retornar estado sin cambios si datos inválidos
  }

  // ✅ Sanear takerBuyBaseVolume sin mutar input (función pura)
  const tb = candle.takerBuyBaseVolume;
  const tbValid =
    tb !== undefined && isFiniteNumber(tb) && tb >= 0 && tb <= candle.volume;

  // Setear OHLC desde kline
  newState.openPx = candle.open;
  newState.highPx = Math.max(candle.open, candle.high);
  newState.lowPx = Math.min(candle.open, candle.low);
  newState.closePx = candle.close;
  newState.tickVol = candle.volume;

  // Reset de tiempos (no inventar)
  newState.highSet = false;
  newState.lowSet = false;
  newState.tHighSec = undefined;
  newState.tLowSec = undefined;

  // Volumen por lado (usar variable local tbValid)
  if (tbValid) {
    newState.buyVol = tb as number;
    newState.sellVol = candle.volume - (tb as number);
  } else {
    // Estimación 50/50
    newState.buyVol = candle.volume / 2;
    newState.sellVol = candle.volume / 2;
  }

  // VWAP aproximado (HLC/3)
  const approxVWAP = (candle.high + candle.low + candle.close) / 3;
  newState.vwapNum = approxVWAP * candle.volume;
  newState.vwapDen = candle.volume;

  // firstMove con epsilon consistente (expresión ternaria)
  newState.firstMove =
    Math.abs(candle.close - candle.open) > eps
      ? candle.close > candle.open
        ? 'up'
        : 'down'
      : undefined;

  // tickCount = 0 para candles (sin ticks individuales)
  newState.tickCount = 0;

  // Reset data quality counters
  newState.invalidTickCount = 0;
  newState.outOfWindowTickCount = 0;

  return newState;
}

/**
 * Calcula la secuencia (HL/LH/H-/-L)
 * Usa epsilon de params para evitar hardcode
 */
export function computeSeq(
  st: MinuteState,
  params: EngineParams = DEFAULT_PARAMS,
): Seq {
  const eps = params.numericEpsilon;
  const highAboveOpen = st.highPx > st.openPx + eps;
  const lowBelowOpen = st.lowPx < st.openPx - eps;

  // Caso 1: Ambos tiempos disponibles (con ticks) → ordenar por tiempo
  if (st.tHighSec !== undefined && st.tLowSec !== undefined) {
    // Si no hay empate de segundo, orden natural
    if (st.tHighSec !== st.tLowSec) {
      return st.tHighSec < st.tLowSec ? 'HL' : 'LH';
    }
    // Empate en el mismo segundo → desempatar de manera determinística
    // 1) firstMove si existe
    if (st.firstMove === 'up') return 'HL';
    if (st.firstMove === 'down') return 'LH';
    // 2) close vs open con epsilon
    if (st.closePx > st.openPx + eps) return 'HL';
    if (st.closePx < st.openPx - eps) return 'LH';
    // 3) último recurso: neutral
    return 'H-';
  }

  // Caso 2: Solo high > open
  if (highAboveOpen && !lowBelowOpen) {
    return 'H-';
  }

  // Caso 3: Solo low < open
  if (lowBelowOpen && !highAboveOpen) {
    return '-L';
  }

  // Caso 4: Desempates sin tiempos
  // 4a) Usar firstMove si disponible
  if (st.firstMove === 'up') {
    return 'H-';
  }
  if (st.firstMove === 'down') {
    return '-L';
  }

  // 4b) Usar close vs open (evita sesgo arbitrario)
  if (st.closePx > st.openPx + eps) {
    return 'H-';
  }
  if (st.closePx < st.openPx - eps) {
    return '-L';
  }

  // 4c) Vela plana (close ≈ open) → neutral H-
  return 'H-';
}

/**
 * Cierra el minuto y calcula todas las métricas
 */
export function closeMinute(
  st: MinuteState,
  params: EngineParams = DEFAULT_PARAMS,
): MinuteMetrics {
  const open = st.openPx;
  const high = st.highPx;
  const low = st.lowPx;
  const close = st.closePx;
  const eps = params.numericEpsilon;

  // Fluctuaciones (usando safeDivEps con epsilon consistente)
  const fluct = safeDivEps((close - open) * 100, open, eps, 0);
  const maxPct = Math.max(0, safeDivEps((high - open) * 100, open, eps, 0));
  const minPct = Math.min(0, safeDivEps((low - open) * 100, open, eps, 0));

  // Seq (pasar params para epsilon consistente)
  const seq = computeSeq(st, params);

  // VWAP
  const vwap =
    st.vwapDen > eps ? safeDivEps(st.vwapNum, st.vwapDen, eps) : undefined;

  // Delta e imbalance
  const delta = st.buyVol - st.sellVol;
  const imbalance =
    st.tickVol > eps ? clamp(safeDivEps(delta, st.tickVol, eps, 0), -1, 1) : 0;

  // Flags de confianza (usar predicados reutilizables)
  const bullish = isBullish(imbalance, close, vwap, params);
  const bearish = isBearish(imbalance, close, vwap, params);

  // Climax se calcula externamente con rolling stats, aquí placeholder
  const climax = false;

  // MeanRevertBias si climax y movimiento fuerte
  let meanRevertBias: MeanRevertBias | undefined;
  if (climax && Math.abs(fluct) > 0.5) {
    meanRevertBias = close > open ? 'down' : 'up';
  }

  const flags: ConfidenceFlags = {
    bullish,
    bearish,
    climax,
    meanRevertBias,
  };

  return {
    tsStart: st.minuteStartTs,
    open,
    high,
    low,
    close,
    fluct,
    maxPct,
    minPct,
    seq,
    tickVol: st.tickVol,
    buyVol: st.buyVol,
    sellVol: st.sellVol,
    delta,
    imbalance,
    vwap,
    tickCount: st.tickCount,
    firstMove: st.firstMove,
    flags,
    // Data quality metrics (opcional, solo si > 0)
    invalidTickCount: st.invalidTickCount > 0 ? st.invalidTickCount : undefined,
    outOfWindowTickCount:
      st.outOfWindowTickCount > 0 ? st.outOfWindowTickCount : undefined,
  };
}

/**
 * Actualiza estadísticas rolling (ventana móvil)
 */
export function updateRollingStats(
  stats: RollingStats,
  metrics: MinuteMetrics,
): RollingStats {
  const newWindow: number[] = [...stats.window, metrics.tickVol];

  // Mantener solo los últimos maxSize elementos
  while (newWindow.length > stats.maxSize) {
    newWindow.shift();
  }

  return {
    maxSize: stats.maxSize,
    window: newWindow,
  };
}

/**
 * Calcula percentil p80 de tickVol desde rolling stats
 */
export function getClimaxThreshold(stats: RollingStats, p: number): number {
  if (stats.window.length === 0) return 0;
  return percentile(stats.window, p);
}

/**
 * Añade flag de climax basado en rolling stats
 */
export function addClimaxFlag(
  metrics: MinuteMetrics,
  stats: RollingStats,
  params: EngineParams = DEFAULT_PARAMS,
): MinuteMetrics {
  const p80 = getClimaxThreshold(stats, params.climaxPercentile);
  const climax = metrics.tickVol >= p80;

  let meanRevertBias: MeanRevertBias | undefined;
  if (climax && Math.abs(metrics.fluct) > params.meanRevertFluctThreshPct) {
    meanRevertBias = metrics.close > metrics.open ? 'down' : 'up';
  }

  return {
    ...metrics,
    flags: {
      ...metrics.flags,
      climax,
      meanRevertBias,
    },
  };
}

/**
 * Inicializa rolling stats
 */
export function initRollingStats(maxSize = 60): RollingStats {
  return {
    window: [],
    maxSize,
  };
}

/**
 * Predice el siguiente movimiento esperado
 *
 * Reglas:
 * 1. bullish && !bearish → expectHL (salvo climax contrario)
 * 2. bearish && !bullish → expectLH (salvo climax contrario)
 * 3. climax + meanRevertBias contrario al sesgo → ambiguous
 * 4. bullish && bearish (empate) → ambiguous
 * 5. Sin señales claras → desempate por seq previo
 * 6. Todo lo demás → ambiguous
 */
/**
 * Helpers locales para climax contrarian
 */
function isClimaxContrarianUp(flags: ConfidenceFlags): boolean {
  return flags.climax && flags.meanRevertBias === 'up';
}

function isClimaxContrarianDown(flags: ConfidenceFlags): boolean {
  return flags.climax && flags.meanRevertBias === 'down';
}

export function predictNext(
  seq: Seq,
  flags: ConfidenceFlags,
): 'expectHL' | 'expectLH' | 'ambiguous' {
  // Caso 1: bullish dominante (sin bearish)
  if (flags.bullish && !flags.bearish) {
    // Si hay climax con bias contrario (down), reducir confianza
    if (isClimaxContrarianDown(flags)) {
      return 'ambiguous';
    }
    return 'expectHL';
  }

  // Caso 2: bearish dominante (sin bullish)
  if (flags.bearish && !flags.bullish) {
    // Si hay climax con bias contrario (up), reducir confianza
    if (isClimaxContrarianUp(flags)) {
      return 'ambiguous';
    }
    return 'expectLH';
  }

  // Caso 3: bullish && bearish (empate por tolerancias) → ambiguous
  if (flags.bullish && flags.bearish) {
    return 'ambiguous';
  }

  // Caso 4: Sin señales claras → desempate por seq previo (exhaustivo)
  switch (seq) {
    case 'HL':
    case 'H-':
      return 'expectHL';
    case 'LH':
    case '-L':
      return 'expectLH';
    default:
      assertNever(seq); // Compilador valida exhaustividad
  }
}

/**
 * Convierte métricas a formato log CSV/JSONL
 */
export function toLogRow(metrics: MinuteMetrics): Record<string, any> {
  return {
    tsStart: metrics.tsStart,
    open: metrics.open,
    high: metrics.high,
    low: metrics.low,
    close: metrics.close,
    fluct: metrics.fluct,
    maxPct: metrics.maxPct,
    minPct: metrics.minPct,
    seq: metrics.seq,
    tickVol: metrics.tickVol,
    buyVol: metrics.buyVol,
    sellVol: metrics.sellVol,
    delta: metrics.delta,
    imbalance: metrics.imbalance,
    vwap: metrics.vwap,
    tickCount: metrics.tickCount,
    firstMove: metrics.firstMove,
    bullish: metrics.flags.bullish,
    bearish: metrics.flags.bearish,
    climax: metrics.flags.climax,
    meanRevertBias: metrics.flags.meanRevertBias,
  };
}

/**
 * Convierte métricas a vector de features para ML
 *
 * Orden y escala de features (índices 0-based):
 *  [0] fluct:      % (±∞) - fluctuación close vs open
 *  [1] maxPct:     % [0,∞) - máxima excursión positiva
 *  [2] minPct:     % (-∞,0] - máxima excursión negativa
 *  [3] seq:        {-1,0,1} - LH→-1, (H-|-L)→0, HL→1
 *  [4] tickVol:    absoluto - volumen total
 *  [5] delta:      absoluto - buyVol - sellVol
 *  [6] imbalance:  [-1,1] - delta/tickVol normalizado
 *  [7] vwap:       precio - VWAP o close si undefined
 *  [8] bullish:    {0,1} - flag binario
 *  [9] bearish:    {0,1} - flag binario
 * [10] climax:     {0,1} - flag binario
 * [11] relativeVol: ratio - tickVol/p50 (solo si stats != undefined)
 *
 * Nota: seq colapsa H- y -L a 0. Para distinguirlos, añade una 2da dimensión.
 *
 * @param metrics - métricas del minuto
 * @param stats - rolling stats (opcional, agrega feature 11)
 * @returns array de 11 o 12 features numéricas
 */
export function toFeatureVector(
  metrics: MinuteMetrics,
  stats?: RollingStats,
): number[] {
  const features = [
    metrics.fluct, // [0] %
    metrics.maxPct, // [1] %
    metrics.minPct, // [2] %
    metrics.seq === 'HL' ? 1 : metrics.seq === 'LH' ? -1 : 0, // [3] encoded
    metrics.tickVol, // [4] absoluto
    metrics.delta, // [5] absoluto
    metrics.imbalance, // [6] [-1,1]
    metrics.vwap ?? metrics.close, // [7] precio
    metrics.flags.bullish ? 1 : 0, // [8] binario
    metrics.flags.bearish ? 1 : 0, // [9] binario
    metrics.flags.climax ? 1 : 0, // [10] binario
  ];

  // [11] relativeVol: ratio vs p50 (solo si stats disponible)
  if (stats && stats.window.length > 0) {
    const p50 = percentile(stats.window, 0.5);
    const relativeVol = p50 > 0 ? metrics.tickVol / p50 : 1;
    features.push(relativeVol);
  }

  return features;
}
