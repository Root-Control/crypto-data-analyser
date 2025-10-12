import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export class MinuteAnalysis {
  @Prop({ required: true })
  minute: string; // HH:MM en UTC

  @Prop({ required: true })
  open: number;

  @Prop({ required: true })
  close: number;

  @Prop({ required: true })
  high: number;

  @Prop({ required: true })
  low: number;

  @Prop({ required: true })
  fluct: number;

  @Prop({ required: true })
  max: number;

  @Prop({ required: true })
  min: number;

  @Prop({ required: true })
  seq: string; // HL, LH, H-, -L

  @Prop()
  tHigh?: number;

  @Prop()
  tLow?: number;

  @Prop()
  prevClose?: number;
}

@Schema({ timestamps: true })
export class CandleAnalyser extends Document {
  @Prop({ required: true, index: true })
  pair: string; // ETHUSDT

  @Prop({ required: true, index: true })
  startDate: string; // YYYY-MM-DD

  @Prop({ required: true, index: true })
  startTime: string; // HH:MM (UTC)

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
