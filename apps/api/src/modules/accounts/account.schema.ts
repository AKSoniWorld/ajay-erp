import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { appendOnly } from '../../common/utils/append-only';

/** Per-customer running balances for ADVANCE (money we hold) and DUE (money they owe). Dairy keeps its own ledger. */
@Schema({ timestamps: true, versionKey: false })
export class CustomerAccount {
  @Prop({ type: Types.ObjectId, required: true, unique: true }) customerId: Types.ObjectId;
  @Prop({ default: 0 }) advancePaise: number;
  @Prop({ default: 0 }) duePaise: number;
}
export const CustomerAccountSchema = SchemaFactory.createForClass(CustomerAccount);

export const LEDGER_KINDS = ['ADVANCE_RECEIPT', 'ADVANCE_USED', 'ADVANCE_REFUND', 'DUE_CREATED', 'DUE_PAYMENT', 'MANUAL'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** Immutable statement lines. delta is signed and applies to that account's balance. */
@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false })
export class CustomerLedger {
  @Prop({ type: Types.ObjectId, required: true }) customerId: Types.ObjectId;
  @Prop({ required: true, enum: ['ADVANCE', 'DUE'] }) account: 'ADVANCE' | 'DUE';
  @Prop({ required: true, enum: LEDGER_KINDS }) kind: LedgerKind;
  @Prop({ required: true }) delta: number;
  @Prop({ required: true }) balanceAfter: number;
  @Prop() mode?: string;
  @Prop() ref?: string;
  @Prop() receiptNo?: string;
  @Prop({ type: Types.ObjectId }) invoiceId?: Types.ObjectId;
  @Prop() invoiceNumber?: string;
  @Prop({ type: Types.ObjectId }) branchId?: Types.ObjectId;
  @Prop() note?: string;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
  at: Date; // CREATED BY AKS
}
export const CustomerLedgerSchema = SchemaFactory.createForClass(CustomerLedger);
CustomerLedgerSchema.index({ customerId: 1, account: 1, at: -1 });
appendOnly(CustomerLedgerSchema, 'CustomerLedger');
