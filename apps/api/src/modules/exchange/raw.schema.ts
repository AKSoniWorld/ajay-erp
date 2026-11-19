import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { appendOnly } from '../../common/utils/append-only';

export const RAW_TYPES = ['EXCHANGE_IN', 'MELT_OUT', 'ADJUST'] as const;
export type RawType = (typeof RAW_TYPES)[number];

/** Raw (old) metal on hand per branch and metal: total net weight and total FINE weight, in mg. */
@Schema({ timestamps: true, versionKey: false })
export class RawStock {
  @Prop({ type: Types.ObjectId, required: true }) branchId: Types.ObjectId;
  @Prop({ required: true, enum: ['GOLD', 'SILVER'] }) metal: 'GOLD' | 'SILVER';
  @Prop({ default: 0 }) netMg: number;
  @Prop({ default: 0 }) fineMg: number;
}
export const RawStockSchema = SchemaFactory.createForClass(RawStock);
RawStockSchema.index({ branchId: 1, metal: 1 }, { unique: true });

@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false })
export class RawMovement {
  @Prop({ type: Types.ObjectId, required: true }) branchId: Types.ObjectId;
  @Prop({ required: true, enum: ['GOLD', 'SILVER'] }) metal: 'GOLD' | 'SILVER';
  @Prop({ required: true, enum: RAW_TYPES }) type: RawType;
  @Prop({ required: true }) netMg: number;   // signed
  @Prop({ required: true }) fineMg: number;  // signed
  @Prop() refType?: string;
  @Prop({ type: Types.ObjectId }) refId?: Types.ObjectId;
  @Prop() note?: string;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export const RawMovementSchema = SchemaFactory.createForClass(RawMovement);
RawMovementSchema.index({ branchId: 1, at: -1 });
appendOnly(RawMovementSchema, 'RawMovement');
