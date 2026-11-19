import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Branch {
  @Prop({ required: true, unique: true, uppercase: true, trim: true }) code: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop() address?: string;
  @Prop() gstin?: string;
  @Prop({ default: 'Jharkhand' }) state: string;
  @Prop({ required: true, unique: true, uppercase: true, trim: true }) invoicePrefix: string;
  @Prop({ default: 0 }) invoiceSeq: number;
  @Prop() whatsappNumber?: string;
  @Prop({ type: Object, default: { tagSize: '40x25', connection: 'usb' } })
  printer: { tagSize: '40x25' | '50x25'; connection: 'usb' | 'bluetooth' | 'agent'; deviceName?: string; language?: 'ESCPOS' | 'TSPL' };
  @Prop({ enum: ['AMOUNT', 'AMOUNT_AND_FINE_WEIGHT'], default: 'AMOUNT' }) exchangeDisplay: 'AMOUNT' | 'AMOUNT_AND_FINE_WEIGHT';
  @Prop({ enum: ['A4', 'A5'], default: 'A4' }) invoicePaper: 'A4' | 'A5';     // default paper for bills / invoices / credit notes (A5 = half of A4)
  @Prop({ enum: ['A4', 'A5'], default: 'A5' }) receiptPaper: 'A4' | 'A5';     // default paper for advance, due and dairy receipts
  /** true → issues GST tax invoices only · false (unregistered) → issues bills of supply (no GST) only. Admin-set, audited. */
  @Prop({ default: true }) gstRegistered: boolean;
  @Prop({ default: true }) active: boolean;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export type BranchDocument = HydratedDocument<Branch>;
export const BranchSchema = SchemaFactory.createForClass(Branch);
