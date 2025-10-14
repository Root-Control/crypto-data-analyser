import { BookSnapshot } from '../types/book.types';
import {
  predictNextCandle,
  type HistoricalCandle,
  type PredictionScore,
} from '../helpers/predictionEngine';

// Algoritmo principal expuesto como "algoritmo1"
export function algoritmo1(
  historicalCandles: HistoricalCandle[],
  currentBook: BookSnapshot | null,
  minCandles = 3,
): PredictionScore {
  return predictNextCandle(historicalCandles, currentBook, minCandles);
}

export type { HistoricalCandle, PredictionScore };
