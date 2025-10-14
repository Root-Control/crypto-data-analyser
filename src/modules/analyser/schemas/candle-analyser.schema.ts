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

  // Volume metrics
  @Prop()
  tickVol?: number;

  @Prop()
  buyVol?: number;

  @Prop()
  sellVol?: number;

  @Prop()
  delta?: number;

  @Prop()
  imbalance?: number;

  @Prop()
  vwap?: number;

  @Prop()
  tickCount?: number;

  // Flow signals
  @Prop()
  firstMove?: string;

  // Data quality counters
  @Prop()
  invalidTickCount?: number;

  @Prop()
  outOfWindowTickCount?: number;

  // Confidence flags
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

  // Order Book snapshot
  @Prop({ type: Object, required: false })
  book?: {
    symbol: string;
    timestamp: number;
    lastUpdateId: number;
    bids: Array<{ price: string; qty: string }>;
    asks: Array<{ price: string; qty: string }>;
    spread?: number;
    spreadPct?: number;
    midPrice?: number;
    totalBidQty?: number;
    totalAskQty?: number;
    imbalance?: number;
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
