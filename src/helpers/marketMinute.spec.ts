/**
 * marketMinute.spec.ts
 * Tests completos para el motor de análisis de minutos
 */

import {
  startMinute,
  ingestTick,
  ingestCandle,
  computeSeq,
  closeMinute,
  updateRollingStats,
  initRollingStats,
  getClimaxThreshold,
  addClimaxFlag,
  predictNext,
  toLogRow,
  toFeatureVector,
  fmt, // v8: Helper de logging
  validateParams, // v8: Validación de params
  DEFAULT_PARAMS,
  type MinuteState,
  type NormalizedTick,
  type CandleInput,
  type EngineParams,
} from './marketMinute';

describe('marketMinute - helpers internos', () => {
  test('secondsWithinMinute: normal (segundo 12)', () => {
    const result = (1012345 - 1000000) / 1000;
    // Como no podemos llamar a la función privada directamente,
    // verificamos indirectamente a través de ingestTick
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: 3805, vol: 10, ts: 1012345 });
    expect(newSt.tHighSec).toBe(12);
  });

  test('secondsWithinMinute: borde superior (segundo 59)', () => {
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: 3805, vol: 10, ts: 1059999 }); // 59.999 seg
    expect(newSt.tHighSec).toBe(59); // Capeado a 59
  });

  test('secondsWithinMinute: borde inferior (segundo 0)', () => {
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: 3805, vol: 10, ts: 1000000 }); // 0 seg
    expect(newSt.tHighSec).toBe(0);
  });
});

describe('marketMinute - guards (out-of-window & invalid data)', () => {
  test('guard: tick fuera de ventana (antes) → rechazado', () => {
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: 3805, vol: 10, ts: 999999 }); // -1ms

    expect(newSt.outOfWindowTickCount).toBe(1);
    expect(newSt.tickCount).toBe(0); // No procesado
    expect(newSt.highPx).toBe(3800); // Sin cambios
  });

  test('guard: tick fuera de ventana (después) → rechazado', () => {
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: 3805, vol: 10, ts: 1060000 }); // +60s

    expect(newSt.outOfWindowTickCount).toBe(1);
    expect(newSt.tickCount).toBe(0); // No procesado
    expect(newSt.highPx).toBe(3800); // Sin cambios
  });

  test('guard: tick con px inválido (NaN) → rechazado', () => {
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: NaN, vol: 10, ts: 1010000 });

    expect(newSt.invalidTickCount).toBe(1);
    expect(newSt.tickCount).toBe(0);
    expect(newSt.highPx).toBe(3800); // Sin cambios
  });

  test('guard: tick con vol inválido (negativo) → rechazado', () => {
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: 3805, vol: -10, ts: 1010000 });

    expect(newSt.invalidTickCount).toBe(1);
    expect(newSt.tickCount).toBe(0);
  });

  test('fast-path: px === openPx → no setea firstMove', () => {
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: 3800, vol: 10, ts: 1010000 }); // Igual al open

    expect(newSt.firstMove).toBeUndefined(); // No detectado
    expect(newSt.tickCount).toBe(1); // Pero sí procesado
  });

  test('unknownSideHandling=split: isBuyerMaker undefined → split 50/50', () => {
    const params = { ...DEFAULT_PARAMS, unknownSideHandling: 'split' as const };
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: 3810, vol: 100, ts: 1010000 }, params); // Sin isBuyerMaker

    expect(newSt.buyVol).toBe(50);
    expect(newSt.sellVol).toBe(50);
    expect(newSt.tickVol).toBe(100);
  });

  test('unknownSideHandling=ignore: isBuyerMaker undefined → no suma a buy/sell', () => {
    const params = {
      ...DEFAULT_PARAMS,
      unknownSideHandling: 'ignore' as const,
    };
    const st = startMinute(3800, 1000000);
    const newSt = ingestTick(st, { px: 3810, vol: 100, ts: 1010000 }, params); // Sin isBuyerMaker

    expect(newSt.buyVol).toBe(0);
    expect(newSt.sellVol).toBe(0);
    expect(newSt.tickVol).toBe(100); // Solo suma a tickVol
  });
});

describe('marketMinute - VWAP con vwapEpsilonPct', () => {
  test('bullish con VWAP: close por encima del threshold (vwapEpsilonPct)', () => {
    const params = {
      ...DEFAULT_PARAMS,
      vwapConfirm: 'closeOverVWAP' as const,
      vwapEpsilonPct: 0.1, // 0.1% de tolerancia
    };

    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3810,
      lowPx: 3800,
      closePx: 3805, // close=3805, vwap=3800, threshold=3800*(1+0.001)=3800.38
      highSet: false,
      lowSet: false,
      tickVol: 1000,
      buyVol: 700,
      sellVol: 300,
      vwapNum: 3800000, // vwap = 3800
      vwapDen: 1000,
      tickCount: 3,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st, params);

    // imbalance = 0.4 >= 0.20, close (3805) >= threshold (3803.8)
    expect(metrics.flags.bullish).toBe(true);
  });

  test('bearish con VWAP: close por debajo del threshold (vwapEpsilonPct)', () => {
    const params = {
      ...DEFAULT_PARAMS,
      vwapConfirm: 'closeOverVWAP' as const,
      vwapEpsilonPct: 0.1, // 0.1% de tolerancia
    };

    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3800,
      lowPx: 3790,
      closePx: 3795, // close=3795, vwap=3800, threshold=3800*(1-0.001)=3796.2
      highSet: false,
      lowSet: false,
      tickVol: 1000,
      buyVol: 300,
      sellVol: 700,
      vwapNum: 3800000, // vwap = 3800
      vwapDen: 1000,
      tickCount: 3,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st, params);

    // imbalance = -0.4 <= -0.20, close (3795) <= threshold (3796.2)
    expect(metrics.flags.bearish).toBe(true);
  });

  test('VWAP en el borde: close justo en el threshold', () => {
    const params = {
      ...DEFAULT_PARAMS,
      vwapConfirm: 'closeOverVWAP' as const,
      vwapEpsilonPct: 0.1, // 0.1%
    };

    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3810,
      lowPx: 3800,
      closePx: 3803.8, // Justo en el threshold (3800 * 1.001)
      highSet: false,
      lowSet: false,
      tickVol: 1000,
      buyVol: 700,
      sellVol: 300,
      vwapNum: 3800000, // vwap = 3800
      vwapDen: 1000,
      tickCount: 3,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st, params);

    // close >= threshold → bullish
    expect(metrics.flags.bullish).toBe(true);
  });
});

describe('marketMinute - computeSeq', () => {
  const baseState: MinuteState = {
    minuteStartTs: 1000000,
    openPx: 3800,
    highPx: 3800,
    lowPx: 3800,
    closePx: 3800,
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

  test('HL: tHighSec < tLowSec', () => {
    const st = {
      ...baseState,
      highPx: 3805,
      lowPx: 3795,
      tHighSec: 10,
      tLowSec: 30,
    };
    expect(computeSeq(st)).toBe('HL');
  });

  test('LH: tLowSec < tHighSec', () => {
    const st = {
      ...baseState,
      highPx: 3805,
      lowPx: 3795,
      tHighSec: 30,
      tLowSec: 10,
    };
    expect(computeSeq(st)).toBe('LH');
  });

  test('H-: solo high > open, sin low < open', () => {
    const st = { ...baseState, highPx: 3805, lowPx: 3800, tHighSec: 10 };
    expect(computeSeq(st)).toBe('H-');
  });

  test('-L: solo low < open, sin high > open', () => {
    const st = { ...baseState, highPx: 3800, lowPx: 3795, tLowSec: 10 };
    expect(computeSeq(st)).toBe('-L');
  });

  test('H- (default): high === low === open', () => {
    const st = { ...baseState, highPx: 3800, lowPx: 3800 };
    expect(computeSeq(st)).toBe('H-');
  });

  test('H-: firstMove up sin tiempos', () => {
    const st = {
      ...baseState,
      highPx: 3800,
      lowPx: 3800,
      firstMove: 'up' as const,
    };
    expect(computeSeq(st)).toBe('H-');
  });

  test('-L: firstMove down sin tiempos', () => {
    const st = {
      ...baseState,
      highPx: 3800,
      lowPx: 3800,
      firstMove: 'down' as const,
    };
    expect(computeSeq(st)).toBe('-L');
  });

  // Tests nuevos: empate tHighSec === tLowSec
  test('Empate tHighSec === tLowSec con firstMove up → HL', () => {
    const st = {
      ...baseState,
      highPx: 3810,
      lowPx: 3790,
      tHighSec: 15,
      tLowSec: 15, // Mismo segundo
      firstMove: 'up' as const,
    };
    expect(computeSeq(st)).toBe('HL');
  });

  test('Empate tHighSec === tLowSec con firstMove down → LH', () => {
    const st = {
      ...baseState,
      highPx: 3810,
      lowPx: 3790,
      tHighSec: 20,
      tLowSec: 20, // Mismo segundo
      firstMove: 'down' as const,
    };
    expect(computeSeq(st)).toBe('LH');
  });

  test('Empate tHighSec === tLowSec sin firstMove, close > open → HL', () => {
    const st = {
      ...baseState,
      highPx: 3810,
      lowPx: 3790,
      closePx: 3805, // close > open
      tHighSec: 25,
      tLowSec: 25,
    };
    expect(computeSeq(st)).toBe('HL');
  });

  test('Empate tHighSec === tLowSec sin firstMove, close < open → LH', () => {
    const st = {
      ...baseState,
      highPx: 3810,
      lowPx: 3790,
      closePx: 3795, // close < open
      tHighSec: 30,
      tLowSec: 30,
    };
    expect(computeSeq(st)).toBe('LH');
  });

  test('Empate tHighSec === tLowSec sin firstMove, close ≈ open → H-', () => {
    const st = {
      ...baseState,
      highPx: 3810,
      lowPx: 3790,
      closePx: 3800, // close ≈ open
      tHighSec: 35,
      tLowSec: 35,
    };
    expect(computeSeq(st)).toBe('H-');
  });
});

describe('marketMinute - startMinute', () => {
  test('inicializa estado correctamente', () => {
    const st = startMinute(3800, 1000000);
    expect(st.openPx).toBe(3800);
    expect(st.highPx).toBe(3800);
    expect(st.lowPx).toBe(3800);
    expect(st.closePx).toBe(3800);
    expect(st.tickVol).toBe(0);
    expect(st.buyVol).toBe(0);
    expect(st.sellVol).toBe(0);
  });
});

describe('marketMinute - ingestTick', () => {
  let st: MinuteState;

  beforeEach(() => {
    st = startMinute(3800, 1000000);
  });

  test('actualiza closePx', () => {
    const tick: NormalizedTick = { px: 3805, vol: 10, ts: 1005000 };
    const newSt = ingestTick(st, tick);
    expect(newSt.closePx).toBe(3805);
  });

  test('detecta firstMove up', () => {
    const tick: NormalizedTick = { px: 3805, vol: 10, ts: 1005000 };
    const newSt = ingestTick(st, tick);
    expect(newSt.firstMove).toBe('up');
  });

  test('detecta firstMove down', () => {
    const tick: NormalizedTick = { px: 3795, vol: 10, ts: 1005000 };
    const newSt = ingestTick(st, tick);
    expect(newSt.firstMove).toBe('down');
  });

  test('actualiza high y marca tHighSec', () => {
    const tick: NormalizedTick = { px: 3805, vol: 10, ts: 1005000 };
    const newSt = ingestTick(st, tick);
    expect(newSt.highPx).toBe(3805);
    expect(newSt.tHighSec).toBe(5); // (1005000 - 1000000) / 1000
  });

  test('actualiza low y marca tLowSec', () => {
    const tick: NormalizedTick = { px: 3795, vol: 10, ts: 1010000 };
    const newSt = ingestTick(st, tick);
    expect(newSt.lowPx).toBe(3795);
    expect(newSt.tLowSec).toBe(10);
  });

  test('acumula buyVol cuando isBuyerMaker=false', () => {
    const tick: NormalizedTick = {
      px: 3800,
      vol: 15,
      ts: 1005000,
      isBuyerMaker: false,
    };
    const newSt = ingestTick(st, tick);
    expect(newSt.buyVol).toBe(15);
    expect(newSt.sellVol).toBe(0);
  });

  test('acumula sellVol cuando isBuyerMaker=true', () => {
    const tick: NormalizedTick = {
      px: 3800,
      vol: 20,
      ts: 1005000,
      isBuyerMaker: true,
    };
    const newSt = ingestTick(st, tick);
    expect(newSt.buyVol).toBe(0);
    expect(newSt.sellVol).toBe(20);
  });

  test('acumula VWAP correctamente', () => {
    let state = st;
    state = ingestTick(state, {
      px: 3800,
      vol: 10,
      ts: 1001000,
      isBuyerMaker: false,
    });
    state = ingestTick(state, {
      px: 3810,
      vol: 20,
      ts: 1002000,
      isBuyerMaker: true,
    });

    // vwapNum = 3800*10 + 3810*20 = 38000 + 76200 = 114200
    // vwapDen = 10 + 20 = 30
    // vwap = 114200 / 30 = 3806.67
    expect(state.vwapNum).toBe(114200);
    expect(state.vwapDen).toBe(30);
  });

  test('ignora tick con vol negativo', () => {
    const tick: NormalizedTick = { px: 3805, vol: -10, ts: 1005000 };
    const newSt = ingestTick(st, tick);
    expect(newSt.tickVol).toBe(0);
  });

  test('ignora tick con px no finito', () => {
    const tick: NormalizedTick = { px: NaN, vol: 10, ts: 1005000 };
    const newSt = ingestTick(st, tick);
    expect(newSt.closePx).toBe(3800); // No cambia
  });
});

describe('marketMinute - ingestCandle', () => {
  test('actualiza OHLC y volumen', () => {
    const st = startMinute(3800, 1000000);
    const candle: CandleInput = {
      open: 3800,
      high: 3820,
      low: 3790,
      close: 3810,
      volume: 1000,
      takerBuyBaseVolume: 600,
    };
    const newSt = ingestCandle(st, candle);

    expect(newSt.highPx).toBe(3820);
    expect(newSt.lowPx).toBe(3790);
    expect(newSt.closePx).toBe(3810);
    expect(newSt.tickVol).toBe(1000);
    expect(newSt.buyVol).toBe(600);
    expect(newSt.sellVol).toBe(400);
  });

  test('estima 50/50 sin takerBuyBaseVolume', () => {
    const st = startMinute(3800, 1000000);
    const candle: CandleInput = {
      open: 3800,
      high: 3820,
      low: 3790,
      close: 3810,
      volume: 1000,
    };
    const newSt = ingestCandle(st, candle);

    expect(newSt.buyVol).toBe(500);
    expect(newSt.sellVol).toBe(500);
  });

  test('detecta firstMove up', () => {
    const st = startMinute(3800, 1000000);
    const candle: CandleInput = {
      open: 3800,
      high: 3820,
      low: 3790,
      close: 3810,
      volume: 1000,
    };
    const newSt = ingestCandle(st, candle);
    expect(newSt.firstMove).toBe('up');
  });

  test('detecta firstMove down', () => {
    const st = startMinute(3800, 1000000);
    const candle: CandleInput = {
      open: 3800,
      high: 3810,
      low: 3790,
      close: 3795,
      volume: 1000,
    };
    const newSt = ingestCandle(st, candle);
    expect(newSt.firstMove).toBe('down');
  });

  test('takerBuyBaseVolume > volume → usa 50/50 sin mutar input', () => {
    const st = startMinute(3800, 1000000);
    const candle: CandleInput = {
      open: 3800,
      high: 3820,
      low: 3790,
      close: 3810,
      volume: 100,
      takerBuyBaseVolume: 150, // ❌ Inválido (> volume)
    };

    const originalTB = candle.takerBuyBaseVolume;
    const newSt = ingestCandle(st, candle);

    // Debe usar 50/50
    expect(newSt.buyVol).toBe(50);
    expect(newSt.sellVol).toBe(50);

    // NO debe mutar el input original (pureza)
    expect(candle.takerBuyBaseVolume).toBe(originalTB);
  });
});

describe('marketMinute - closeMinute', () => {
  test('calcula fluct, maxPct, minPct correctamente', () => {
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3820,
      lowPx: 3790,
      closePx: 3810,
      highSet: true,
      lowSet: true,
      tHighSec: 10,
      tLowSec: 20,
      tickVol: 1000,
      buyVol: 600,
      sellVol: 400,
      vwapNum: 3805000,
      vwapDen: 1000,
      tickCount: 4,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st);

    // fluct = (3810 - 3800) / 3800 * 100 = 0.263%
    expect(metrics.fluct).toBeCloseTo(0.263, 2);

    // maxPct = (3820 - 3800) / 3800 * 100 = 0.526%
    expect(metrics.maxPct).toBeCloseTo(0.526, 2);

    // minPct = (3790 - 3800) / 3800 * 100 = -0.263%
    expect(metrics.minPct).toBeCloseTo(-0.263, 2);
  });

  test('calcula delta e imbalance', () => {
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3800,
      lowPx: 3800,
      closePx: 3800,
      highSet: false,
      lowSet: false,
      tickVol: 1000,
      buyVol: 700,
      sellVol: 300,
      vwapNum: 0,
      vwapDen: 0,
      tickCount: 0,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st);

    // delta = 700 - 300 = 400
    expect(metrics.delta).toBe(400);

    // imbalance = 400 / 1000 = 0.4
    expect(metrics.imbalance).toBe(0.4);
  });

  test('clamp imbalance entre -1 y 1', () => {
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3800,
      lowPx: 3800,
      closePx: 3800,
      highSet: false,
      lowSet: false,
      tickVol: 100,
      buyVol: 200, // Más buyVol que tickVol (caso extremo)
      sellVol: 0,
      vwapNum: 0,
      vwapDen: 0,
      tickCount: 0,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st);
    expect(metrics.imbalance).toBe(1); // Clamped
  });

  test('imbalance = 0 cuando tickVol = 0', () => {
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3800,
      lowPx: 3800,
      closePx: 3800,
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

    const metrics = closeMinute(st);
    expect(metrics.imbalance).toBe(0);
  });

  test('calcula VWAP correctamente', () => {
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3800,
      lowPx: 3800,
      closePx: 3800,
      highSet: false,
      lowSet: false,
      tickVol: 1000,
      buyVol: 500,
      sellVol: 500,
      vwapNum: 3805000,
      vwapDen: 1000,
      tickCount: 2,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st);
    expect(metrics.vwap).toBe(3805);
  });

  test('VWAP undefined cuando vwapDen = 0', () => {
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3800,
      lowPx: 3800,
      closePx: 3800,
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

    const metrics = closeMinute(st);
    expect(metrics.vwap).toBeUndefined();
  });

  test('flag bullish cuando imbalance >= 0.20', () => {
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3810,
      lowPx: 3800,
      closePx: 3810,
      highSet: false,
      lowSet: false,
      tickVol: 1000,
      buyVol: 700,
      sellVol: 300,
      vwapNum: 3805000,
      vwapDen: 1000,
      tickCount: 3,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st, {
      ...DEFAULT_PARAMS,
      vwapConfirm: 'closeOverVWAP',
    });

    // imbalance = 0.4 >= 0.20, close (3810) > vwap (3805)
    expect(metrics.flags.bullish).toBe(true);
  });

  test('flag bearish cuando imbalance <= -0.20', () => {
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3800,
      lowPx: 3790,
      closePx: 3790,
      highSet: false,
      lowSet: false,
      tickVol: 1000,
      buyVol: 300,
      sellVol: 700,
      vwapNum: 3795000,
      vwapDen: 1000,
      tickCount: 3,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st, {
      ...DEFAULT_PARAMS,
      vwapConfirm: 'closeOverVWAP',
    });

    // imbalance = -0.4 <= -0.20, close (3790) < vwap (3795)
    expect(metrics.flags.bearish).toBe(true);
  });

  test('no retorna NaN o Infinity', () => {
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 0, // Edge case: openPx = 0
      highPx: 0,
      lowPx: 0,
      closePx: 0,
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

    const metrics = closeMinute(st);

    expect(isFinite(metrics.fluct)).toBe(true);
    expect(isFinite(metrics.maxPct)).toBe(true);
    expect(isFinite(metrics.minPct)).toBe(true);
    expect(isFinite(metrics.imbalance)).toBe(true);
  });

  test('clamp neutral: NaN → 0 cuando 0 está en [min, max]', () => {
    // Importar clamp indirectamente a través de closeMinute
    // que usa clamp para imbalance
    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3800,
      lowPx: 3800,
      closePx: 3800,
      highSet: false,
      lowSet: false,
      tickVol: 0, // Division por 0 → NaN antes de clamp
      buyVol: 0,
      sellVol: 0,
      vwapNum: 0,
      vwapDen: 0,
      tickCount: 0,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st);

    // imbalance debe ser 0 (no -1) cuando hay NaN
    expect(metrics.imbalance).toBe(0);
  });
});

describe('marketMinute - rollingStats', () => {
  test('inicializa correctamente', () => {
    const stats = initRollingStats(60);
    expect(stats.window).toEqual([]);
    expect(stats.maxSize).toBe(60);
  });

  test('actualiza ventana y mantiene límite', () => {
    let stats = initRollingStats(3);

    const metrics1 = closeMinute(startMinute(3800, 1000000));
    metrics1.tickVol = 100;
    stats = updateRollingStats(stats, metrics1);
    expect(stats.window).toEqual([100]);

    const metrics2 = closeMinute(startMinute(3800, 1000000));
    metrics2.tickVol = 200;
    stats = updateRollingStats(stats, metrics2);
    expect(stats.window).toEqual([100, 200]);

    const metrics3 = closeMinute(startMinute(3800, 1000000));
    metrics3.tickVol = 300;
    stats = updateRollingStats(stats, metrics3);
    expect(stats.window).toEqual([100, 200, 300]);

    const metrics4 = closeMinute(startMinute(3800, 1000000));
    metrics4.tickVol = 400;
    stats = updateRollingStats(stats, metrics4);
    expect(stats.window).toEqual([200, 300, 400]); // Expira 100
  });

  test('calcula percentil p80 correctamente', () => {
    const stats = {
      window: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      maxSize: 10,
    };

    const p80 = getClimaxThreshold(stats, 0.8);
    // p80 de [10..100] = 80
    expect(p80).toBe(80);
  });

  test('añade flag climax', () => {
    const stats = {
      window: [100, 200, 300, 400, 500],
      maxSize: 10,
    };

    const metrics = closeMinute(startMinute(3800, 1000000));
    metrics.tickVol = 450; // Por encima de p80 (400)

    const enriched = addClimaxFlag(metrics, stats);
    expect(enriched.flags.climax).toBe(true);
  });

  test('añade meanRevertBias cuando climax y fluct fuerte', () => {
    const stats = {
      window: [100, 200, 300, 400, 500],
      maxSize: 10,
    };

    const st: MinuteState = {
      minuteStartTs: 1000000,
      openPx: 3800,
      highPx: 3825,
      lowPx: 3800,
      closePx: 3825, // close > open
      highSet: false,
      lowSet: false,
      tickVol: 600, // climax
      buyVol: 400,
      sellVol: 200,
      vwapNum: 0,
      vwapDen: 0,
      tickCount: 0,
      invalidTickCount: 0,
      outOfWindowTickCount: 0,
    };

    const metrics = closeMinute(st);
    const enriched = addClimaxFlag(metrics, stats);

    expect(enriched.flags.climax).toBe(true);
    expect(enriched.flags.meanRevertBias).toBe('down'); // close > open → bias down
  });
});

describe('marketMinute - predictNext', () => {
  test('expectHL cuando bullish sin bearish', () => {
    const flags = { bullish: true, bearish: false, climax: false };
    expect(predictNext('HL', flags)).toBe('expectHL');
  });

  test('expectLH cuando bearish sin bullish', () => {
    const flags = { bullish: false, bearish: true, climax: false };
    expect(predictNext('LH', flags)).toBe('expectLH');
  });

  test('ambiguous cuando bullish + climax con bias contrario', () => {
    const flags = {
      bullish: true,
      bearish: false,
      climax: true,
      meanRevertBias: 'down' as const,
    };
    expect(predictNext('HL', flags)).toBe('ambiguous');
  });

  test('ambiguous cuando bearish + climax con bias contrario', () => {
    const flags = {
      bullish: false,
      bearish: true,
      climax: true,
      meanRevertBias: 'up' as const,
    };
    expect(predictNext('LH', flags)).toBe('ambiguous');
  });

  test('usa seq como desempate: HL → expectHL', () => {
    const flags = { bullish: false, bearish: false, climax: false };
    expect(predictNext('HL', flags)).toBe('expectHL');
  });

  test('usa seq como desempate: LH → expectLH', () => {
    const flags = { bullish: false, bearish: false, climax: false };
    expect(predictNext('LH', flags)).toBe('expectLH');
  });

  test('usa seq como desempate: H- → expectHL', () => {
    const flags = { bullish: false, bearish: false, climax: false };
    expect(predictNext('H-', flags)).toBe('expectHL');
  });

  test('usa seq como desempate: -L → expectLH', () => {
    const flags = { bullish: false, bearish: false, climax: false };
    expect(predictNext('-L', flags)).toBe('expectLH');
  });
});

describe('marketMinute - toLogRow', () => {
  test('convierte métricas a objeto plano', () => {
    const metrics = closeMinute(startMinute(3800, 1000000));
    const row = toLogRow(metrics);

    expect(row).toHaveProperty('tsStart');
    expect(row).toHaveProperty('open');
    expect(row).toHaveProperty('fluct');
    expect(row).toHaveProperty('seq');
    expect(row).toHaveProperty('imbalance');
    expect(row).toHaveProperty('bullish');
    expect(row).toHaveProperty('climax');
  });
});

describe('marketMinute - toFeatureVector', () => {
  test('genera vector de features', () => {
    const metrics = closeMinute(startMinute(3800, 1000000));
    const features = toFeatureVector(metrics);

    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBeGreaterThan(0);
    expect(features.every((f) => isFinite(f))).toBe(true);
  });

  test('incluye percentil relativo con stats', () => {
    const stats = {
      window: [100, 200, 300],
      maxSize: 10,
    };

    const metrics = closeMinute(startMinute(3800, 1000000));
    metrics.tickVol = 400;

    const features = toFeatureVector(metrics, stats);
    expect(features.length).toBeGreaterThan(11); // Tiene feature adicional
  });
});

describe('marketMinute - fmt (v8)', () => {
  test('formatea número con decimales', () => {
    expect(fmt(3.14159, 2)).toBe('3.14');
    expect(fmt(0.123456, 4)).toBe('0.1235');
  });

  test('maneja undefined', () => {
    expect(fmt(undefined)).toBeUndefined();
    expect(fmt(undefined, 2)).toBeUndefined();
  });

  test('maneja NaN', () => {
    expect(fmt(NaN)).toBe('N/A');
  });

  test('maneja Infinity', () => {
    expect(fmt(Infinity)).toBe('N/A');
  });
});

describe('marketMinute - validateParams (v8)', () => {
  test('acepta DEFAULT_PARAMS', () => {
    expect(() => validateParams(DEFAULT_PARAMS)).not.toThrow();
  });

  test('rechaza climaxLookback <= 0', () => {
    const params = { ...DEFAULT_PARAMS, climaxLookback: 0 };
    expect(() => validateParams(params)).toThrow('climaxLookback');
  });

  test('rechaza climaxPercentile fuera de [0,1]', () => {
    const params1 = { ...DEFAULT_PARAMS, climaxPercentile: -0.1 };
    const params2 = { ...DEFAULT_PARAMS, climaxPercentile: 1.5 };
    expect(() => validateParams(params1)).toThrow('climaxPercentile');
    expect(() => validateParams(params2)).toThrow('climaxPercentile');
  });

  test('rechaza imbalanceBull <= imbalanceBear', () => {
    const params = {
      ...DEFAULT_PARAMS,
      imbalanceBull: -0.3,
      imbalanceBear: -0.2,
    };
    expect(() => validateParams(params)).toThrow('imbalanceBull');
  });
});

describe('marketMinute - golden test (integración)', () => {
  test('flujo completo: ticks → close → rolling → predict', () => {
    // Setup
    let st = startMinute(3800, 1000000);
    let stats = initRollingStats(5);

    // Simular ticks con patrón HL (high primero, luego low)
    st = ingestTick(st, {
      px: 3815,
      vol: 100,
      ts: 1005000,
      isBuyerMaker: false,
    }); // High primero
    st = ingestTick(st, {
      px: 3820,
      vol: 150,
      ts: 1010000,
      isBuyerMaker: false,
    });
    st = ingestTick(st, {
      px: 3795,
      vol: 200,
      ts: 1015000,
      isBuyerMaker: true,
    }); // Low después
    st = ingestTick(st, {
      px: 3810,
      vol: 50,
      ts: 1020000,
      isBuyerMaker: false,
    });

    // Cerrar minuto
    let metrics = closeMinute(st);

    // Verificar cálculos básicos
    expect(metrics.close).toBe(3810);
    expect(metrics.fluct).toBeGreaterThan(0);
    expect(metrics.seq).toBe('HL'); // High en seg 5, Low en seg 15
    expect(metrics.buyVol).toBeGreaterThan(metrics.sellVol);
    expect(metrics.imbalance).toBeGreaterThan(0);

    // Actualizar rolling
    stats = updateRollingStats(stats, metrics);

    // Añadir climax
    metrics = addClimaxFlag(metrics, stats, {
      ...DEFAULT_PARAMS,
      climaxPercentile: 0.5,
    });

    // Predecir siguiente
    const prediction = predictNext(metrics.seq, metrics.flags);
    expect(['expectHL', 'expectLH', 'ambiguous']).toContain(prediction);

    // Convertir a log
    const logRow = toLogRow(metrics);
    expect(logRow.seq).toBe('HL');
    expect(typeof logRow.imbalance).toBe('number');
  });

  test('climax con meanRevertBias detectado', () => {
    let stats = initRollingStats(5);

    // Llenar stats con volúmenes bajos
    for (let i = 0; i < 5; i++) {
      const m = closeMinute(startMinute(3800, 1000000 + i * 60000));
      m.tickVol = 100;
      stats = updateRollingStats(stats, m);
    }

    // Crear minuto con volumen climax y movimiento fuerte
    let st = startMinute(3800, 2000000);
    st = ingestTick(st, {
      px: 3850,
      vol: 500,
      ts: 2005000,
      isBuyerMaker: false,
    });
    st = ingestTick(st, {
      px: 3860,
      vol: 500,
      ts: 2010000,
      isBuyerMaker: false,
    });

    let metrics = closeMinute(st);
    metrics = addClimaxFlag(metrics, stats, {
      ...DEFAULT_PARAMS,
      climaxPercentile: 0.8,
    });

    expect(metrics.flags.climax).toBe(true);
    expect(metrics.flags.meanRevertBias).toBe('down'); // close > open
  });
});
