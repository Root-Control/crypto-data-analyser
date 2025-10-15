import { BookSnapshot } from '../types/book.types';
import {
  predictNextCandle,
  type HistoricalCandle,
  type PredictionScore,
} from '../helpers/predictionEngine';

// Basic Prediction Algorithm
export function basicPrediction(
  historicalCandles: HistoricalCandle[],
  currentBook: BookSnapshot | null,
  minCandles = 3,
): PredictionScore {
  return predictNextCandle(historicalCandles, currentBook, minCandles);
}

export type { HistoricalCandle, PredictionScore };
