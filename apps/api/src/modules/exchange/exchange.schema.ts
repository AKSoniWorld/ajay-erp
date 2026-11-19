import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { appendOnly } from '../../common/utils/append-only';

/** INTERNAL record of old metal taken on a finalized invoice. Immutable. */
@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false, minimize: false })
export class Exchange {
  @Prop({ type: Types.ObjectId, required: true, index: true }) invoiceId: Types.ObjectId;
  @Prop() invoiceNumber?: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) branchId: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) customerId?: Types.ObjectId;
  @Prop({ type: [Object], default: [] }) items: any[];
  @Prop({ type: Object }) totals: Record<string, number>;
  @Prop({ type: [Object], default: [] }) editHistory: any[];
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export const ExchangeSchema = SchemaFactory.createForClass(Exchange);
ExchangeSchema.index({ branchId: 1, at: -1 });
appendOnly(ExchangeSchema, 'Exchange');
