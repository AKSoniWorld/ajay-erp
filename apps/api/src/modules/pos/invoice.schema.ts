import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true, minimize: false })
export class Invoice {
  @Prop({ type: Types.ObjectId, required: true, index: true }) branchId: Types.ObjectId;
  @Prop({ enum: ['SALE', 'CREDIT_NOTE'], default: 'SALE' }) type: 'SALE' | 'CREDIT_NOTE';
  @Prop() number?: string;
  @Prop({ enum: ['DRAFT', 'FINAL', 'CANCELLED'], default: 'DRAFT', index: true }) status: 'DRAFT' | 'FINAL' | 'CANCELLED';
  @Prop({ enum: ['GST', 'NON_GST'], default: 'GST', index: true }) taxMode: 'GST' | 'NON_GST'; // tax invoice vs bill of supply
  @Prop({ default: false }) locked: boolean;
  @Prop({ type: Types.ObjectId, index: true }) customerId?: Types.ObjectId;
  /** Priced lines (qty-multiplied paise): productId,name,sku,hsn,metal,purityPct,grossMg,netMg,qty,metalValue,stoneValue,making */
  @Prop({ type: [Object], default: [] }) lines: any[];
  @Prop({ type: Object, default: {} }) rates: Record<string, { rateId: string; ratePerGramPaise: number }>;
  @Prop({ type: Object }) totals: any;               // pricing.engine output (minus internal exchangeDetail)
  @Prop({ type: [Object], default: [] }) payments: { mode: 'CASH' | 'UPI' | 'CARD'; amountPaise: number; ref?: string }[];
  @Prop({ type: [Types.ObjectId], default: [] }) exchangeIds: Types.ObjectId[];
  /** INTERNAL: priced old-metal items {metal,grossMg,lessMg,netMg,purityPct,fineMg,ratePerGramPaise,valuePaise,remarks}. Never in customer output. */
  @Prop({ type: [Object], default: [] }) exchanges: any[];
  @Prop({ type: [Object], default: [] }) exchangeEdits: { at: Date; by: string; before: any[] }[]; // draft edit trail
  /** INTERNAL: dairy balance used on this bill [{schemeId, amountPaise}]. Customer copy shows the total amount only. */
  @Prop({ type: [Object], default: [] }) dairy: { schemeId: string; amountPaise: number; confirmForfeitBonus?: boolean }[];
  @Prop({ type: [Types.ObjectId], default: [] }) dairyLedgerIds: Types.ObjectId[];
  @Prop({ default: 0 }) advancePaise: number;   // customer advance applied to this bill
  @Prop({ default: 0 }) duePaise: number;       // left unpaid on this bill (sale on credit)
  @Prop({ type: Types.ObjectId }) dairyLedgerId?: Types.ObjectId;               // Phase 5
  @Prop() remarks?: string;
  @Prop() clientUuid?: string;                       // offline idempotency (Phase 10)
  @Prop({ type: Types.ObjectId }) creditNoteOf?: Types.ObjectId;
  @Prop() reason?: string;
  @Prop() finalizedAt?: Date;
  @Prop({ type: Types.ObjectId }) finalizedBy?: Types.ObjectId;
  @Prop() contentHash?: string;
  @Prop({ type: Types.ObjectId, index: true }) createdBy?: Types.ObjectId;
  /** Sales made offline and synced later: the device's provisional receipt number, which device, and whether stock went negative. */
  @Prop({ default: false }) offline: boolean;
  @Prop() provisionalNo?: string;
  @Prop() deviceId?: string;
  @Prop({ default: false }) negativeStock: boolean;
  createdAt: Date; // BY AKS
  updatedAt: Date; //BY AKS
}
export type InvoiceDocument = HydratedDocument<Invoice>;
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

InvoiceSchema.index({ branchId: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: 'string' } } });
InvoiceSchema.index({ clientUuid: 1 }, { unique: true, partialFilterExpression: { clientUuid: { $type: 'string' } } });
InvoiceSchema.index({ creditNoteOf: 1 }, { unique: true, partialFilterExpression: { creditNoteOf: { $type: 'objectId' } } });

// ---- Immutability: a locked invoice can never be changed or deleted through Mongoose ----
InvoiceSchema.post('init', function (doc: any) { doc.$locals.wasLocked = doc.locked; });
InvoiceSchema.pre('save', function () {
  if (!this.isNew && (this as any).$locals.wasLocked) throw new Error('Invoice is locked');
});
// Update filters get "locked != true" appended, so a locked invoice simply never matches.
InvoiceSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'] as any,
  function (this: any) { this.setQuery({ $and: [this.getQuery(), { locked: { $ne: true } }] }); });
InvoiceSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'] as any,
  function () { throw new Error('Invoices cannot be deleted'); });
