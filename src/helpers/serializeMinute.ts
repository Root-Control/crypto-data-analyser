/**
 * serializeMinute.ts
 * Serializa MinuteMetrics del motor a formato MongoDB
 * Mantiene backward compatibility con nombres legacy
 */

import type { MinuteMetrics, MinuteState } from './marketMinute';

/**
 * Convierte MinuteMetrics + MinuteState a formato de persistencia MongoDB
 *
 * Mantiene nombres legacy para backward compatibility:
 * - max ← maxPct
 * - min ← minPct
 * - tHigh ← tHighSec
 * - tLow ← tLowSec
 *
 * Agrega campos nuevos de v8.1:
 * - tickVol, buyVol, sellVol, delta, imbalance, vwap
 * - tickCount, invalidTickCount, outOfWindowTickCount
 * - firstMove, flags (bullish, bearish, climax, meanRevertBias)
 *
 * @param metrics - Métricas calculadas por closeMinute()
 * @param st - Estado del minuto (opcional, para tHighSec/tLowSec)
 * @param prevClose - Precio de cierre del minuto anterior (opcional)
 * @returns Objeto serializado para MongoDB
 */
export function serializeMinute(
  metrics: MinuteMetrics,
  st?: MinuteState,
  prevClose?: number,
) {
  return {
    // ===== LEGACY FIELDS (backward compatibility) =====
    minute: new Date(metrics.tsStart).toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }), // HH:MM en UTC
    open: metrics.open,
    close: metrics.close,
    high: metrics.high,
    low: metrics.low,
    fluct: metrics.fluct,
    max: metrics.maxPct, // Legacy name para maxPct
    min: metrics.minPct, // Legacy name para minPct
    seq: metrics.seq,
    tHigh: st?.tHighSec ?? null, // null si no disponible
    tLow: st?.tLowSec ?? null, // null si no disponible
    prevClose: prevClose ?? null, // null si no disponible

    // ===== NEW ANALYTICS (v8.1) =====
    // Volume metrics
    tickVol: metrics.tickVol,
    buyVol: metrics.buyVol,
    sellVol: metrics.sellVol,
    delta: metrics.delta,
    imbalance: metrics.imbalance,
    vwap: metrics.vwap ?? null, // null si no calculado

    // Tick metadata
    tickCount: metrics.tickCount,
    invalidTickCount: metrics.invalidTickCount ?? null,
    outOfWindowTickCount: metrics.outOfWindowTickCount ?? null,

    // Flow signals
    firstMove: metrics.firstMove ?? null, // 'up' | 'down' | null

    // Confidence flags
    flags: {
      bullish: metrics.flags.bullish,
      bearish: metrics.flags.bearish,
      climax: metrics.flags.climax,
      meanRevertBias: metrics.flags.meanRevertBias ?? null, // 'up' | 'down' | null
    },
  };
}

