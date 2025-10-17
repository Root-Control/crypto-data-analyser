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
  const basePrediction = predictNextCandle(
    historicalCandles,
    currentBook,
    minCandles,
  );

  return basePrediction;
}

export type { HistoricalCandle, PredictionScore };
