/**
 * marketMinute - Barrel export
 *
 * Exporta solo la API pública documentada para tree-shaking óptimo.
 *
 * Para importar desde el paquete raíz:
 * ```typescript
 * import { startMinute, ingestTick, closeMinute, DEFAULT_PARAMS } from './helpers';
 * ```
 */

// ===== TYPES & INTERFACES =====
export type {
  Seq,
  FirstMove,
  MeanRevertBias,
  NormalizedTick,
  CandleInput,
  MinuteState,
  MinuteMetrics,
  ConfidenceFlags,
  EngineParams,
  RollingStats,
} from './marketMinute';

// ===== DEFAULT PARAMETERS =====
export { DEFAULT_PARAMS } from './marketMinute';

// ===== PUBLIC API (15 funciones) =====
export {
  startMinute,
  ingestTick,
  ingestCandle,
  computeSeq,
  closeMinute,
  updateRollingStats,
  getClimaxThreshold,
  addClimaxFlag,
  initRollingStats,
  predictNext,
  toLogRow,
  toFeatureVector,
  fmt, // v8: Helper de logging
  validateParams, // v8: Validación de parámetros (dev-time)
} from './marketMinute';

// ===== SERIALIZATION =====
export { serializeMinute } from './serializeMinute';

// ===== PREDICTION ENGINE =====
export {
  predictNextCandle,
  formatPrediction,
  getPredictionColor,
  type MomentumScore,
  type BookPressure,
  type PredictionScore,
  type HistoricalCandle,
} from './predictionEngine';
