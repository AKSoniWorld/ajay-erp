import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const MOVEMENT_TYPES = ['OPENING', 'PURCHASE', 'SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUST', 'RETURN'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Derived/cached stock per product per branch. Written ONLY by InventoryService.move(). */
@Schema({ timestamps: true, versionKey: false })
export class BranchStock {
  @Prop({ type: Types.ObjectId, required: true }) productId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) branchId: Types.ObjectId;
  @Prop({ required: true, default: 0 }) qty: number;
}
export const BranchStockSchema = SchemaFactory.createForClass(BranchStock);
BranchStockSchema.index({ productId: 1, branchId: 1 }, { unique: true });

/** Immutable stock ledger. */
@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false })
export class StockMovement {
  @Prop({ type: Types.ObjectId, required: true, index: true }) productId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) branchId: Types.ObjectId;
  @Prop({ required: true, enum: MOVEMENT_TYPES }) type: MovementType;
  @Prop({ required: true }) qty: number; // signed
  @Prop() refType?: string;
  @Prop({ type: Types.ObjectId }) refId?: Types.ObjectId;
  @Prop() note?: string;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
StockMovementSchema.index({ branchId: 1, at: -1 });
const block = function () { throw new Error('StockMovement is append-only'); };
StockMovementSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
    'replaceOne', 'deleteOne', 'deleteMany'] as any, block as any);
StockMovementSchema.pre('save', function () { if (!this.isNew) throw new Error('StockMovement is append-only'); });
