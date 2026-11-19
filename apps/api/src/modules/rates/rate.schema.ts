import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { appendOnly } from '../../common/utils/append-only';

export type Metal = 'GOLD' | 'SILVER';
/** SALE = selling · EXCHANGE = old-metal buying · MARKET = 24K gold / silver rate used to convert cash ↔ fine weight with suppliers */
export type RateKind = 'SALE' | 'EXCHANGE' | 'MARKET';
export type Karat = 24 | 22 | 18;

/**
 * Immutable rate history, one series per grade: GOLD 22K, GOLD 18K, SILVER (single rate, no purity).
 * SALE = selling rate; EXCHANGE = old-metal buying rate (Phase 4). Paise per gram of that grade.
 */
@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false })
export class Rate {
  @Prop({ required: true, enum: ['GOLD', 'SILVER'] }) metal: Metal;
  @Prop({ type: Number, enum: [24, 22, 18] }) karat?: Karat; // GOLD only
  @Prop({ required: true, enum: ['SALE', 'EXCHANGE', 'MARKET'] }) kind: RateKind;
  @Prop({ required: true }) ratePerGramPaise: number;
  @Prop({ required: true }) reason: string;
  @Prop({ type: Types.ObjectId, required: true }) setBy: Types.ObjectId;
  at: Date; // CREATED BY AKS
}
export const RateSchema = SchemaFactory.createForClass(Rate);
RateSchema.index({ metal: 1, karat: 1, kind: 1, at: -1 });
appendOnly(RateSchema, 'Rate');
