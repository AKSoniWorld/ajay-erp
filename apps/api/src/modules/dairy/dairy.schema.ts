import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { appendOnly } from '../../common/utils/append-only';

@Schema({ timestamps: true })
export class DairyScheme {
  @Prop({ required: true, unique: true }) schemeNo: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) customerId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) branchId: Types.ObjectId;
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) monthlyPaise: number;
  @Prop({ type: Number, required: true, enum: [6, 11, 12] }) durationMonths: number;
  @Prop({ required: true, enum: ['NORMAL', 'BONUS'] }) schemeType: 'NORMAL' | 'BONUS';
  @Prop({ default: 1 }) bonusInstallments: number;
  @Prop({ default: 0 }) paidPaise: number;      // total deposited (installments only)
  @Prop({ default: 0 }) balancePaise: number;   // usable balance = deposits + bonus ± adjustments − bill redemptions
  @Prop() bonusCreditedAt?: Date;
  @Prop() bonusForfeitedAt?: Date;              // set when the balance is used before the scheme is complete
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export const DairySchemeSchema = SchemaFactory.createForClass(DairyScheme);

@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false })
export class DairyPayment {
  @Prop({ type: Types.ObjectId, required: true, index: true }) schemeId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) customerId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) branchId: Types.ObjectId;
  @Prop({ required: true }) amountPaise: number;
  @Prop({ required: true, enum: ['CASH', 'UPI', 'CARD'] }) mode: 'CASH' | 'UPI' | 'CARD';
  @Prop() ref?: string;
  @Prop({ required: true }) monthsCovered: number;
  @Prop({ required: true, unique: true }) receiptNo: string;
  @Prop() paidMonthsAfter: number;
  @Prop() paidPaiseAfter: number;
  @Prop({ type: Types.ObjectId }) collectedBy?: Types.ObjectId;
  at: Date; // BY AKS
}
export const DairyPaymentSchema = SchemaFactory.createForClass(DairyPayment);
appendOnly(DairyPaymentSchema, 'DairyPayment');

/** Immutable ledger: balance = Σ CREDIT − Σ DEBIT. DairyScheme.balancePaise is its atomic cache. */
@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false })
export class DairyLedger {
  @Prop({ type: Types.ObjectId, required: true, index: true }) schemeId: Types.ObjectId;
  @Prop({ required: true, enum: ['CREDIT', 'DEBIT'] }) direction: 'CREDIT' | 'DEBIT';
  @Prop({ required: true, enum: ['PAYMENT', 'BONUS', 'INVOICE', 'MANUAL'] }) kind: 'PAYMENT' | 'BONUS' | 'INVOICE' | 'MANUAL';
  @Prop({ required: true }) amountPaise: number; // always positive
  @Prop({ type: Types.ObjectId }) invoiceId?: Types.ObjectId;
  @Prop() invoiceNumber?: string;
  @Prop({ type: Types.ObjectId }) paymentId?: Types.ObjectId;
  @Prop({ required: true }) balanceAfter: number;
  @Prop() note?: string;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export const DairyLedgerSchema = SchemaFactory.createForClass(DairyLedger);
appendOnly(DairyLedgerSchema, 'DairyLedger');
