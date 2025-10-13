import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SetupState, SetupType, CloseReason } from '../types/trading.types';

@Schema({ timestamps: true })
export class TradingSetup extends Document {
  @Prop({ required: true, index: true })
  setupId: string;

  @Prop({ required: true, index: true })
  blockId: string;

  @Prop({ required: true })
  pair: string;

  @Prop({ required: true })
  type: SetupType;

  @Prop({ required: true, default: 'IDLE' })
  state: SetupState;

  @Prop({ required: true })
  bias: string; // LONG | SHORT

  // Niveles de entrada y salida
  @Prop({ required: true })
  entry: number;

  @Prop({ required: true })
  sl: number;

  @Prop({ required: true })
  tp1: number;

  @Prop({ required: true })
  tp2: number;

  // Órdenes (JSON objects)
  @Prop({ type: Object })
  entryOrder?: any;

  @Prop({ type: Object })
  slOrder?: any;

  @Prop({ type: Object })
  tp1Order?: any;

  @Prop({ type: Object })
  tp2Order?: any;

  // Gestión
  @Prop({ default: false })
  tp1Filled: boolean;

  @Prop()
  trailingSL?: number;

  @Prop()
  quantity?: number;

  @Prop()
  tp1Quantity?: number;

  @Prop()
  tp2Quantity?: number;

  // Precios reales de ejecución
  @Prop()
  fillPrice?: number; // Precio real de entrada

  @Prop()
  tp1Price?: number; // Precio real de TP1

  @Prop()
  orderPlacementTs?: number; // Timestamp cuando se activa la orden (especial para RETEST)

  // Métricas
  @Prop()
  entryTime?: number;

  @Prop()
  filledAt?: number; // Timestamp del fill

  @Prop()
  tp1Time?: number;

  @Prop()
  tp1VelaIndex?: number; // Índice de vela donde tocó TP1

  @Prop()
  closeTime?: number;

  @Prop()
  closeReason?: CloseReason;

  @Prop()
  pnl?: number;

  @Prop()
  mae?: number;

  @Prop()
  mfe?: number;

  // Ventana temporal
  @Prop({ required: true })
  windowStart: number;

  @Prop({ required: true })
  windowEnd: number;

  // Metadata
  @Prop({ required: true })
  createdAt: number;

  @Prop({ type: Object })
  metadata?: any;
}

export const TradingSetupSchema = SchemaFactory.createForClass(TradingSetup);

// Índices
TradingSetupSchema.index({ setupId: 1 }, { unique: true });
TradingSetupSchema.index({ blockId: 1, state: 1 });
TradingSetupSchema.index({ pair: 1, state: 1 });
