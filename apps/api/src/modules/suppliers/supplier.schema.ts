import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { appendOnly } from '../../common/utils/append-only';

@Schema({ timestamps: true })
export class Supplier {
  @Prop({ required: true, trim: true, index: true }) name: string;
  @Prop() mobile?: string;
  @Prop() address?: string;
  @Prop() gstin?: string;
  @Prop() remarks?: string;
  /** + = we owe the supplier · − = supplier owes us (advance paid). Atomic cache of the ledger. */
  @Prop({ default: 0 }) balancePaise: number;   // CASH account (paise)
  @Prop({ default: 0 }) goldFineMg: number;     // fine GOLD owed (mg; + = we owe, − = advance in metal)
  @Prop({ default: 0 }) silverFineMg: number;   // fine SILVER owed (mg)
  @Prop({ default: true }) active: boolean;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export const SupplierSchema = SchemaFactory.createForClass(Supplier);
SupplierSchema.index({ mobile: 1 }, { unique: true, partialFilterExpression: { mobile: { $type: 'string' } } });

export const SUPPLIER_KINDS = ['PURCHASE', 'PAYMENT', 'PURCHASE_CANCEL', 'CONVERSION', 'MANUAL'] as const;
export type SupplierKind = (typeof SUPPLIER_KINDS)[number];

/** Immutable supplier statement. delta > 0 increases what we owe. */
@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false })
export class SupplierLedger {
  @Prop({ type: Types.ObjectId, required: true, index: true }) supplierId: Types.ObjectId;
  @Prop({ required: true, enum: SUPPLIER_KINDS }) kind: SupplierKind;
  @Prop({ enum: ['CASH', 'GOLD', 'SILVER'], default: 'CASH' }) account: 'CASH' | 'GOLD' | 'SILVER'; // which balance this line moves
  @Prop({ required: true }) delta: number;      // paise for CASH, mg of fine metal for GOLD/SILVER
  @Prop() cashPaise?: number;                   // cash value behind a metal line (settlement / conversion)
  @Prop() rateGramPaise?: number;               // 24K gold / silver market rate used for the conversion
  @Prop({ required: true }) balanceAfter: number;
  @Prop({ type: Types.ObjectId }) purchaseId?: Types.ObjectId;
  @Prop() purchaseNo?: string;
  @Prop() billNo?: string;
  @Prop() voucherNo?: string;
  @Prop() mode?: string;
  @Prop() ref?: string;
  @Prop({ type: Types.ObjectId }) branchId?: Types.ObjectId;
  @Prop() note?: string;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export const SupplierLedgerSchema = SchemaFactory.createForClass(SupplierLedger);
SupplierLedgerSchema.index({ supplierId: 1, at: -1 });
appendOnly(SupplierLedgerSchema, 'SupplierLedger');

@Schema({ timestamps: true, minimize: false })
export class Purchase {
  @Prop({ required: true, unique: true }) number: string;               // our internal number, PREFIX-PU-FY-000001
  @Prop({ type: Types.ObjectId, required: true, index: true }) supplierId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) branchId: Types.ObjectId;
  @Prop() billNo?: string;                                               // the supplier's own bill number
  @Prop({ required: true }) billDate: Date;
  @Prop({ type: [Object], default: [] }) items: { productId?: Types.ObjectId; sku?: string; description: string; qty: number; unitCostPaise: number; amountPaise: number;
    settleInFine?: boolean; metal?: string; fineMg?: number }[];
  @Prop({ required: true }) subtotalPaise: number;
  @Prop({ default: 0 }) fineGoldMg: number;                              // fine gold owed on this bill (items settled in fine)
  @Prop({ default: 0 }) fineSilverMg: number;
  @Prop({ default: 0 }) gstPaise: number;                                // input GST on the supplier bill
  @Prop({ required: true }) totalPaise: number;
  @Prop({ default: 0 }) paidPaise: number;                               // paid at the time of entry
  @Prop({ enum: ['ACTIVE', 'CANCELLED'], default: 'ACTIVE', index: true }) status: 'ACTIVE' | 'CANCELLED';
  @Prop() cancelReason?: string;
  @Prop() cancelledAt?: Date;
  @Prop({ type: Types.ObjectId }) cancelledBy?: Types.ObjectId;
  @Prop() remarks?: string;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export const PurchaseSchema = SchemaFactory.createForClass(Purchase);
PurchaseSchema.index({ supplierId: 1, billNo: 1 }, { unique: true, partialFilterExpression: { billNo: { $type: 'string' } } });
