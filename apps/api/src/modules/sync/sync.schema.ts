import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const SYNC_STATUSES = ['PROCESSING', 'APPLIED', 'NEEDS_REVIEW', 'FAILED', 'RESOLVED'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** One record per operation a device sends. clientUuid makes every operation idempotent. */
@Schema({ timestamps: true, minimize: false })
export class SyncOp {
  @Prop({ required: true, unique: true }) clientUuid: string;
  @Prop({ required: true }) deviceId: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) branchId?: Types.ObjectId;
  @Prop({ required: true, enum: ['SALE', 'DAIRY_PAYMENT'] }) type: 'SALE' | 'DAIRY_PAYMENT';
  @Prop({ type: Object, default: {} }) payload: Record<string, unknown>;
  @Prop({ enum: SYNC_STATUSES, default: 'PROCESSING', index: true }) status: SyncStatus;
  @Prop({ type: Object }) result?: Record<string, unknown>;     // invoiceId, invoiceNumber, receiptNo, …
  @Prop() error?: string;
  @Prop() appliedAt?: Date;
  @Prop({ type: Types.ObjectId }) resolvedBy?: Types.ObjectId;
  @Prop() resolvedAt?: Date;
  @Prop() resolveNote?: string;
}
export const SyncOpSchema = SchemaFactory.createForClass(SyncOp);
SyncOpSchema.index({ branchId: 1, status: 1, createdAt: -1 });
