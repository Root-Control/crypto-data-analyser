import {
  CandleAnalyser,
  MinuteAnalysis,
} from '../modules/analyser/schemas/candle-analyser.schema';

export type Bias = 'LONG' | 'SHORT';

export interface EntrySetup {
  type: string;
  rule?: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp1TrailRule: string;
}

export interface PredictionLevels {
  keyLevel: number;
  retestBand: [number, number];
  volMedian7Pct: number;
  bandPts: number;
  last15mHigh: number;
  last15mLow: number;
}

export interface Invalidation {
  cancelIfLongTriggerFirst?: number;
  cancelIfShortTriggerFirst?: number;
}

export interface PredictionResult {
  ok: boolean;
  mode?: string;
  bias?: Bias;
  levels?: PredictionLevels;
  entries?: EntrySetup[];
  invalidation?: Invalidation;
  reason?: string;
}

export interface PredictOptions {
  biasBlocks?: number;
  bandScale?: number;
  slPct?: number;
  tp1Pct?: number;
  tp2Pct?: number;
  tick?: number;
  tailForCounts?: number;
  tailForVol?: number;
}

/**
 * Predice el SIGUIENTE bloque de 15m a partir de N bloques previos (N >= 3).
 * Usa los últimos `biasBlocks` para el sesgo y todas las velas para volatilidad por defecto.
 */
export function predictNextFromBlocks(
  blocks: CandleAnalyser[],
  opts: PredictOptions = {},
): PredictionResult {
  const {
    biasBlocks = 3,
    bandScale = 0.6,
    slPct = 0.0015,
    tp1Pct = 0.002,
    tp2Pct = 0.0045,
    tick = 0.01,
    tailForCounts = 10,
    tailForVol = 7,
  } = opts;

  // -------- helpers --------
  const round2 = (x: number): number => Math.round(x * 100) / 100;
  const round3 = (x: number): number => Math.round(x * 1000) / 1000;
  const flat = (arr: CandleAnalyser[]): MinuteAnalysis[] =>
    arr.reduce(
      (acc, b) => acc.concat(b.analysis || []),
      [] as MinuteAnalysis[],
    );
  const last = <T>(arr: T[], n = 1): T[] => arr.slice(-n);
  const median = (arr: number[]): number => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  // -------- validación --------
  if (!Array.isArray(blocks) || blocks.length < 3) {
    return {
      ok: false,
      reason: "Se requieren al menos 3 bloques con 'analysis'.",
    };
  }
  if (
    !blocks.every(
      (b) => b && Array.isArray(b.analysis) && b.analysis.length > 0,
    )
  ) {
    return {
      ok: false,
      reason: "Algún bloque no tiene 'analysis' con velas.",
    };
  }

  // recorta cuántos bloques entran al voto de sesgo
  const useN = Math.max(3, Math.min(biasBlocks, blocks.length));
  const biasWindow = blocks.slice(-useN);
  const lastBlock = blocks[blocks.length - 1];

  // High/Low del último 15m (referencia inmediata)
  const lastMins = lastBlock.analysis;
  const last15mHigh = Math.max(...lastMins.map((c) => c.high));
  const last15mLow = Math.min(...lastMins.map((c) => c.low));
  const blockOpen = lastMins[0].open;
  const blockClose = lastMins[lastMins.length - 1].close;
  const lastBlockChange = (blockClose - blockOpen) / blockOpen;

  // Todas las velas disponibles para colas recientes
  const allMinutes = flat(blocks);

  // Conteo de últimas X velas (rojas vs verdes)
  const tailCounts = last(allMinutes, tailForCounts);
  const reds = tailCounts.filter((c) => c.close < c.open).length;
  const greens = tailCounts.length - reds;

  // Voto por bloques (cambio % intrabloque)
  const blockChange = (b: CandleAnalyser): number => {
    const cs = b.analysis;
    return (cs[cs.length - 1].close - cs[0].open) / cs[0].open;
  };
  const votes = biasWindow.map((b) => (blockChange(b) >= 0 ? 'LONG' : 'SHORT'));
  const voteScore = votes.reduce(
    (acc, v) => (v === 'LONG' ? acc + 1 : acc - 1),
    0,
  );

  // Bias final (reglas simples y consistentes)
  let bias: Bias;
  if (lastBlockChange > 0 && greens > reds) bias = 'LONG';
  else if (lastBlockChange < 0 && reds >= greens) bias = 'SHORT';
  else bias = voteScore > 0 ? 'LONG' : 'SHORT';

  // Volatilidad mediana de las últimas tailForVol velas 1m
  const tailVol = last(allMinutes, tailForVol);
  const vList = tailVol.map(
    (c) => Math.abs((c.close - c.open) / c.close) * 100,
  );
  const volMedian7Pct = median(vList) || 0.085; // fallback defensivo

  // Banda de retest
  const priceRef = blockClose;
  const bandPts = priceRef * (volMedian7Pct / 100) * bandScale;

  // Nivel clave (con los últimos 5 cierres del último bloque)
  const last5closes = last(
    lastMins.map((c) => c.close),
    5,
  );
  const keyLevel =
    bias === 'SHORT' ? Math.min(...last5closes) : Math.max(...last5closes);
  const retestBand: [number, number] = [
    round2(keyLevel - bandPts),
    round2(keyLevel + bandPts),
  ];

  // Entradas/SL/TP según bias
  let entries: EntrySetup[] = [];
  let invalidation: Invalidation = {};

  if (bias === 'SHORT') {
    const entryMom = round2(last15mLow - tick);
    const slMom = round2(entryMom * (1 + slPct));
    const tp1Mom = round2(entryMom * (1 - tp1Pct));
    const tp2Mom = round2(entryMom * (1 - tp2Pct));

    const entryRet = round2(keyLevel);
    const slRet = round2(entryRet * (1 + slPct));
    const tp1Ret = round2(entryRet * (1 - tp1Pct));
    const tp2Ret = round2(entryRet * (1 - tp2Pct));

    entries = [
      {
        type: 'MOMENTUM_SELL_STOP',
        entry: entryMom,
        sl: slMom,
        tp1: tp1Mom,
        tp2: tp2Mom,
        tp1TrailRule:
          'al tocar TP1, mover SL de la parte restante a entrada + 0.02% (~+0.75 pt)',
      },
      {
        type: 'RETEST_LIMIT_AFTER_RED',
        rule: 'si toca banda y la siguiente 1m cierra roja',
        entry: entryRet,
        sl: slRet,
        tp1: tp1Ret,
        tp2: tp2Ret,
        tp1TrailRule:
          'al tocar TP1, mover SL de la parte restante a entrada + 0.02% (~+0.75 pt)',
      },
    ];
    invalidation = { cancelIfLongTriggerFirst: round2(last15mHigh + tick) };
  } else {
    const entryMom = round2(last15mHigh + tick);
    const slMom = round2(entryMom * (1 - slPct));
    const tp1Mom = round2(entryMom * (1 + tp1Pct));
    const tp2Mom = round2(entryMom * (1 + tp2Pct));

    const entryRet = round2(keyLevel);
    const slRet = round2(entryRet * (1 - slPct));
    const tp1Ret = round2(entryRet * (1 + tp1Pct));
    const tp2Ret = round2(entryRet * (1 + tp2Pct));

    entries = [
      {
        type: 'MOMENTUM_BUY_STOP',
        entry: entryMom,
        sl: slMom,
        tp1: tp1Mom,
        tp2: tp2Mom,
        tp1TrailRule:
          'al tocar TP1, mover SL de la parte restante a entrada - 0.02% (~-0.75 pt)',
      },
      {
        type: 'RETEST_LIMIT_AFTER_GREEN',
        rule: 'si toca banda y la siguiente 1m cierra verde',
        entry: entryRet,
        sl: slRet,
        tp1: tp1Ret,
        tp2: tp2Ret,
        tp1TrailRule:
          'al tocar TP1, mover SL de la parte restante a entrada - 0.02% (~-0.75 pt)',
      },
    ];
    invalidation = { cancelIfShortTriggerFirst: round2(last15mLow - tick) };
  }

  return {
    ok: true,
    mode: 'next-block-prediction',
    bias,
    levels: {
      keyLevel: round2(keyLevel),
      retestBand,
      volMedian7Pct: round3(volMedian7Pct),
      bandPts: round2(bandPts),
      last15mHigh: round2(last15mHigh),
      last15mLow: round2(last15mLow),
    },
    entries,
    invalidation,
  };
}
