import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export class MinuteAnalysis {
  @Prop({ required: true })
  minute: string; // HH:MM en UTC

  // OHLC
  @Prop({ required: true })
  open: number;

  @Prop({ required: true })
  close: number;

  @Prop({ required: true })
  high: number;

  @Prop({ required: true })
  low: number;

  // Fluctuaciones
  @Prop({ required: true })
  fluct: number;

  @Prop({ required: true })
  max: number;

  @Prop({ required: true })
  min: number;

  // Secuencia
  @Prop({ required: true })
  seq: string; // HL, LH, H-, -L

  @Prop()
  tHigh?: number;

  @Prop()
  tLow?: number;

  @Prop()
  prevClose?: number;

  // Volume metrics (nuevo del marketMinute engine)
  @Prop()
  tickVol?: number; // Volumen total

  @Prop()
  buyVol?: number; // Volumen comprador

  @Prop()
  sellVol?: number; // Volumen vendedor

  @Prop()
  delta?: number; // buyVol - sellVol

  @Prop()
  imbalance?: number; // delta normalizado [-1, 1]

  @Prop()
  vwap?: number; // Volume Weighted Average Price

  @Prop()
  tickCount?: number; // Cantidad de ticks procesados

  // Flow signals
  @Prop()
  firstMove?: string; // 'up' | 'down'

  // v8.1: Data quality counters
  @Prop()
  invalidTickCount?: number;

  @Prop()
  outOfWindowTickCount?: number;

  // v8.1: Confidence flags (structured subdocument)
  @Prop({
    type: {
      bullish: { type: Boolean, required: true },
      bearish: { type: Boolean, required: true },
      climax: { type: Boolean, required: true },
      meanRevertBias: { type: String, enum: ['up', 'down'], required: false },
    },
    required: false,
    _id: false,
  })
  flags?: {
    bullish: boolean;
    bearish: boolean;
    climax: boolean;
    meanRevertBias?: string;
  };
}

@Schema({ timestamps: true })
export class CandleAnalyser extends Document {
  @Prop({ required: true, index: true })
  pair: string; // ETHUSDT

  @Prop({ required: true, index: true })
  startDate: string; // YYYY-MM-DD

  @Prop({ required: true, index: true })
  startTime: string; // HH:MM (UTC)

  @Prop({ required: true, default: 'in-progress' })
  status: string; // in-progress | completed

  @Prop({ type: [MinuteAnalysis], default: [] })
  analysis: MinuteAnalysis[];
}

export const CandleAnalyserSchema =
  SchemaFactory.createForClass(CandleAnalyser);

// Índice compuesto para startDate + startTime + pair
CandleAnalyserSchema.index(
  { pair: 1, startDate: 1, startTime: 1 },
  { unique: true },
);
