import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const TRANSFER_STATUSES = ['PENDING', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'REJECTED', 'CANCELLED'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

@Schema({ timestamps: true, minimize: false })
export class Transfer {
  @Prop({ required: true, unique: true }) number: string;                        // PREFIX(from)-TR-FY-000001
  @Prop({ type: Types.ObjectId, required: true, index: true }) fromBranchId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) toBranchId: Types.ObjectId;
  @Prop({ type: [Object], default: [] }) items: { productId: Types.ObjectId; sku: string; name: string; qty: number }[];
  @Prop({ enum: TRANSFER_STATUSES, default: 'PENDING', index: true }) status: TransferStatus;
  @Prop() note?: string;
  @Prop({ type: Types.ObjectId }) requestedBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) approvedBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) dispatchedBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) receivedBy?: Types.ObjectId;
  @Prop() approvedAt?: Date;
  @Prop() dispatchedAt?: Date;
  @Prop() receivedAt?: Date;
  /** Full trail of who moved the transfer to which status, and when. */
  @Prop({ type: [Object], default: [] }) history: { status: TransferStatus; at: Date; by: string; note?: string }[];
}
export const TransferSchema = SchemaFactory.createForClass(Transfer);
TransferSchema.index({ fromBranchId: 1, createdAt: -1 });
TransferSchema.index({ toBranchId: 1, createdAt: -1 });
