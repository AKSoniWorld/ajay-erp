import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuthUser } from '@ajay/shared';
//import { CASH_LIMIT_PAISE } from '../../common/constants';
import { canonicalJson } from '../../common/utils/canonical-json';
import { formatINR } from '../../common/utils/money';
import { calculate, toCustomerInvoice } from '../../engines/pricing.engine';
import { ExchangeInput, exchangeRateKey, priceExchangeItems } from '../../engines/exchange';
import { priceLine } from '../../engines/line-pricing';
import { DocKind, financialYearCode, formatDocNumber } from '../../engines/numbering';
import { BranchesService } from '../branches/branches.service';
import { Counter } from '../catalog/counter.schema';
import { Product } from '../catalog/product.schema';
import { ProductsService } from '../catalog/products.service';
import { CustomersService } from '../customers/customers.service';
import { AccountsService } from '../accounts/accounts.service';
import { PdfService } from '../print/pdf.service';
import { DairyService } from '../dairy/dairy.service';
import { DairyUseDto } from '../dairy/dto/dairy.dto';
import { ExchangeService } from '../exchange/exchange.service';
import { InventoryService } from '../inventory/inventory.service';
import { RatesService } from '../rates/rates.service';
import {
  CancelDto, CreateDraftDto, CreditNoteDto, FinalizeDto, InvoiceQueryDto, LineDto, QuoteDto,
  SearchQueryDto, UpdateDraftDto,
} from './dto/pos.dto';
import { Invoice } from './invoice.schema';

const sum = (xs: { amountPaise: number }[]) => xs.reduce((s, x) => s + x.amountPaise, 0);
const negate = (t: Record<string, any>) => Object.fromEntries(Object.entries(t).map(([k, v]) =>
  [k, typeof v === 'number' && k !== 'gstRate' ? (v === 0 ? 0 : -v) : v]));
const toExInputs = (xs: any[] = []): ExchangeInput[] => xs.map(e => ({
  metal: e.metal, grossMg: e.grossMg, lessMg: e.lessMg, purityPct: e.purityPct, remarks: e.remarks }));

/** Tamper-evident hash over everything the invoice (and its internal exchange record) depends on. */
export function computeHash(d: any): string {
  return createHash('sha256').update(canonicalJson({
    number: d.number, type: d.type, taxMode: d.taxMode ?? 'GST', branchId: d.branchId, customerId: d.customerId, lines: d.lines,
    exchanges: d.exchanges ?? [], dairy: d.dairy ?? [], advancePaise: d.advancePaise ?? 0, duePaise: d.duePaise ?? 0, totals: d.totals, payments: d.payments, rates: d.rates ?? {},
    creditNoteOf: d.creditNoteOf ?? null, finalizedAt: d.finalizedAt,
  })).digest('hex');
}

/** Extra options used when an offline sale is synced: price with the rates of that moment, back-date, tolerate oversell. */
export interface FinalizeOpts {
  asOf?: Date; finalizedAt?: Date; allowNegativeStock?: boolean;
  offline?: { provisionalNo?: string; deviceId?: string };
}

@Injectable()
export class PosService {
  constructor(
    @InjectModel(Invoice.name) private model: Model<Invoice>,
    @InjectModel(Product.name) private products: Model<Product>,
    @InjectModel(Counter.name) private counters: Model<any>,
    @InjectConnection() private conn: Connection,
    private rates: RatesService, private inventory: InventoryService, private branches: BranchesService,
    private customers: CustomersService, private productsSvc: ProductsService, private exchange: ExchangeService,
    private dairy: DairyService, private accounts: AccountsService, private pdf: PdfService,
  ) {}

  // ---------------- access ----------------
  private async assertBranch(user: AuthUser, branchId: string) {
    if (user.role !== 'ADMIN' && !user.branchIds.includes(branchId)) throw new NotFoundException('Invoice not found');
    await this.branches.assertAllExist([branchId]);
  }
  private assertAccess(user: AuthUser, inv: { branchId: any; createdBy?: any }) {
    const denied = (user.role !== 'ADMIN' && !user.branchIds.includes(String(inv.branchId)))
      || (user.role === 'STAFF' && String(inv.createdBy) !== user.id); // POS staff see only their own bills
    if (denied) throw new NotFoundException('Invoice not found');
  }
  private async load(id: string, user: AuthUser, session?: ClientSession) {
    const inv = await this.model.findById(id).session(session ?? null);
    if (!inv) throw new NotFoundException('Invoice not found');
    this.assertAccess(user, inv);
    return inv;
  }

  // ---------------- invoice tax mode ----------------
/** Registered branch: GST by default; each bill may use GST or NON_GST. Unregistered branch: NON_GST only. */
  private async taxModeFor(branchId: string): Promise<'GST' | 'NON_GST'> {
    const b = await this.branches.findOne(branchId);
    return b.gstRegistered === false ? 'NON_GST' : 'GST';
  }

  private async assertTaxModeAllowed(branchId: string, taxMode: 'GST' | 'NON_GST') {
    if (taxMode !== 'GST') return;
    const b = await this.branches.findOne(branchId);
    if (b.gstRegistered === false) {
      throw new BadRequestException('GST cannot be selected for an unregistered branch');
    }
  }
  // ---------------- pricing ----------------
  /**
   * Server-side pricing from current products + rates. Client totals/rates are never trusted.
   * Sale lines: net weight Ãƒâ€” grade rate. Old metal: fine weight (net Ãƒâ€” purity%) Ãƒâ€” exchange rate.
   */
  private async build(items: LineDto[], exchangeInputs: ExchangeInput[] = [], dairyInputs: DairyUseDto[] = [], advancePaise = 0,
    session?: ClientSession, customerId?: string, taxMode: 'GST' | 'NON_GST' = 'GST', asOf?: Date, discountPaise = 0) {
    const ids = items.map(i => i.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate product lines; increase qty instead');
    const prods = await this.products.find({ _id: { $in: ids } }).session(session ?? null).lean();
    const byId = new Map(prods.map(p => [String(p._id), p]));
    const rates = await this.rates.currentSale(session, asOf);

    const lines = items.map(it => {
      const p = byId.get(it.productId);
      if (!p || !p.active) throw new BadRequestException(`Product ${it.productId} is unavailable`);
      const qty = it.qty ?? 1;
      let priced;
      const key = p.metal === 'GOLD' ? (p.karat ? `GOLD_${p.karat}K` : undefined) : p.metal === 'SILVER' ? 'SILVER' : undefined;
      if (p.metal === 'GOLD' && !key) throw new BadRequestException(`${p.sku} has no karat set`);
      try { priced = priceLine(p, qty, key ? rates[key]?.ratePerGramPaise : undefined, key?.replace('_', ' ')); }
      catch (e: any) { throw new BadRequestException(e.message); }
      return {
        productId: p._id, name: p.name, sku: p.sku, hsn: p.hsn, metal: p.metal, karat: p.karat, purityPct: p.purityPct,
        grossMg: p.grossMg, netMg: p.netMg, qty, ...priced,
      };
    });

    const exRates = exchangeInputs.length ? await this.rates.currentByKind('EXCHANGE', session, asOf) : {};
    let exchanges;
    try { exchanges = priceExchangeItems(exchangeInputs, exRates); }
    catch (e: any) { throw new BadRequestException(e.message); }

    // Dairy comes last in the calculation order: subtotal (after old metal) Ã¢â€ â€™ minus dairy Ã¢â€ â€™ final payable
    const dairyCheck = await this.dairy.checkUse(dairyInputs, customerId, session);
    let calc;
    try {
      calc = calculate({
        lines: lines.map(l => ({ name: l.name, sku: l.sku, metalValue: l.metalValue + l.stoneValue, making: l.making })),
        exchanges, dairyAdjustment: dairyCheck.total, dairyAvailable: dairyCheck.available, discountPaise,
        gstRatePct: taxMode === 'NON_GST' ? 0 : undefined,
      });
    } catch (e: any) { throw new BadRequestException(e.message); }
    const { exchangeDetail, ...totals } = calc;
    await this.accounts.checkAdvance(customerId, advancePaise, totals.finalPayable, session);
    if (totals.finalPayable < 0)
      throw new BadRequestException('Old-metal value exceeds the bill amount. Add items or reduce the exchange.');

    const exSnapshot = Object.fromEntries(exchanges.map(e => exchangeRateKey(e.metal))
      .map(k => [`EXCHANGE_${k}`, exRates[k]]));
    return { lines, totals, rates: { ...rates, ...exSnapshot }, exchanges,
      dairy: dairyInputs.map(d => ({ schemeId: d.schemeId, amountPaise: d.amountPaise, confirmForfeitBonus: d.confirmForfeitBonus ?? false })),
      advancePaise };
  }

  async quote(dto: QuoteDto, user: AuthUser) {
    await this.assertBranch(user, dto.branchId);
    const taxMode = dto.taxMode ?? await this.taxModeFor(dto.branchId);
    await this.assertTaxModeAllowed(dto.branchId, taxMode);
    const result = await this.build(dto.lines, dto.exchanges, dto.dairy, dto.advancePaise, undefined, dto.customerId,
      taxMode, undefined, dto.discountPaise ?? 0);
    return { ...result, taxMode };
  }

  async search(q: SearchQueryDto, user: AuthUser) {
    await this.assertBranch(user, q.branchId);
    let list: any[];
    if (q.code) list = [await this.productsSvc.findByCode(q.code)];
    else {
      const f: Record<string, unknown> = { active: true };
      if (q.q) { const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); f.$or = [{ name: rx }, { sku: rx }]; }
      list = await this.products.find(f).sort({ name: 1 }).limit(20);
    }
    const qty = await this.inventory.branchQty(q.branchId, list.map(p => String(p._id)));
    return list.map(p => ({ ...(p.toJSON ? p.toJSON() : p), qty: qty.get(String(p._id)) ?? 0 }));
  }

  // ---------------- drafts ----------------
  async createDraft(dto: CreateDraftDto, user: AuthUser, opts: { asOf?: Date } = {}) {
    await this.assertBranch(user, dto.branchId);
    if (dto.clientUuid) {
      const existing = await this.model.findOne({ clientUuid: dto.clientUuid });
      if (existing) { this.assertAccess(user, existing); return existing; } // idempotent retry
    }
    if (dto.customerId) await this.customers.findOne(dto.customerId);
    const taxMode = dto.taxMode ?? await this.taxModeFor(dto.branchId);
    await this.assertTaxModeAllowed(dto.branchId, taxMode);
    const b = await this.build(dto.lines, dto.exchanges, dto.dairy, dto.advancePaise, undefined, dto.customerId,
      taxMode, opts.asOf, dto.discountPaise ?? 0);
    return this.model.create({
      branchId: new Types.ObjectId(dto.branchId), customerId: dto.customerId && new Types.ObjectId(dto.customerId),
      ...b, taxMode, remarks: dto.remarks, clientUuid: dto.clientUuid, createdBy: new Types.ObjectId(user.id),
    } as any);
  }

  async updateDraft(id: string, dto: UpdateDraftDto, user: AuthUser) {
    const inv = await this.load(id, user);
    if (inv.status !== 'DRAFT') throw new ConflictException('Only drafts can be edited');
    const set: Record<string, unknown> = {};
    let push: Record<string, unknown> | undefined;
    if (dto.customerId) { await this.customers.findOne(dto.customerId); set.customerId = new Types.ObjectId(dto.customerId); }
    if (dto.remarks !== undefined) set.remarks = dto.remarks;
    const branchTaxMode = await this.taxModeFor(String(inv.branchId));
    if (dto.taxMode !== undefined || dto.lines || dto.exchanges !== undefined || dto.dairy !== undefined || dto.advancePaise !== undefined || dto.discountPaise !== undefined || dto.customerId) {
      const lineInputs = dto.lines ?? inv.lines.map(l => ({ productId: String(l.productId), qty: l.qty }));
      const exInputs = dto.exchanges !== undefined ? dto.exchanges : toExInputs(inv.exchanges);
      const dairyInputs = dto.dairy !== undefined ? dto.dairy : (inv.dairy ?? []);
      const customerId = dto.customerId ?? (inv.customerId ? String(inv.customerId) : undefined);
      const advanceIn = dto.advancePaise !== undefined ? dto.advancePaise : (inv.advancePaise ?? 0);
      const discountIn = dto.discountPaise !== undefined ? dto.discountPaise : (inv.totals?.discountPaise ?? 0);
      const taxMode = dto.taxMode ?? inv.taxMode ?? branchTaxMode;
      if (dto.taxMode !== undefined) await this.assertTaxModeAllowed(String(inv.branchId), taxMode);
      Object.assign(set, await this.build(lineInputs, exInputs, dairyInputs, advanceIn, undefined, customerId,
        taxMode, undefined, discountIn), { taxMode }); // always re-priced
      // Exchange edit trail: what the items looked like before this change
      if (dto.exchanges !== undefined && inv.exchanges?.length)
        push = { exchangeEdits: { at: new Date(), by: user.id, before: inv.exchanges } };
    }
    if (!Object.keys(set).length && !push) return inv;
    const upd = await this.model.findOneAndUpdate({ _id: id, status: 'DRAFT' },
      { ...(Object.keys(set).length && { $set: set }), ...(push && { $push: push }) } as any, { new: true });
    if (!upd) throw new ConflictException('Only drafts can be edited');
    return upd;
  }

  async cancelDraft(id: string, dto: CancelDto, user: AuthUser) {
    await this.load(id, user);
    const upd = await this.model.findOneAndUpdate({ _id: id, status: 'DRAFT' },
      { $set: { status: 'CANCELLED', locked: true, reason: dto.reason } }, { new: true });
    if (!upd) throw new ConflictException('Only drafts can be cancelled');
    return upd;
  }

  // ---------------- finalize ----------------
  private async nextNumber(branchId: any, kind: DocKind, session: ClientSession) {
    const branch = await this.branches.findOne(String(branchId));
    const fy = financialYearCode();
    const c = await this.counters.findOneAndUpdate(
      { _id: `${kind}:${branchId}:${fy}` }, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    return formatDocNumber(branch.invoicePrefix, fy, c.seq, kind);
  }

  /** Cash today = bills + dairy deposits for this customer (Sec 269ST). */
  // private async assertCashLimit(payments: { mode: string; amountPaise: number }[], customerId: any, session: ClientSession) {
  //   const cash = sum(payments.filter(p => p.mode === 'CASH'));
  //   if (!cash) return;
  //   if (cash + (await this.dairy.cashToday(customerId, session)) >= CASH_LIMIT_PAISE)
  //     throw new BadRequestException('Cash receipts of Ã¢â€šÂ¹2,00,000 or more from one customer in a day are not permitted (Sec 269ST). Take the balance by UPI/card/bank transfer.');
  // }

  /** Atomic: re-price Ã¢â€ â€™ check payments Ã¢â€ â€™ number Ã¢â€ â€™ stock Ã¢â€ â€™ old-metal into raw inventory Ã¢â€ â€™ lock. Any failure rolls everything back. */
  finalize(id: string, dto: FinalizeDto, user: AuthUser, opts: FinalizeOpts = {}) {
    return this.conn.transaction(async session => {
      const inv = await this.load(id, user, session);
      if (inv.status === 'FINAL') return inv; // safe retry
      if (inv.status !== 'DRAFT') throw new ConflictException('Invoice is cancelled');
      if (!inv.customerId) throw new BadRequestException('Customer is required before finalizing');

      const b = await this.build(inv.lines.map(l => ({ productId: String(l.productId), qty: l.qty })), toExInputs(inv.exchanges),
        inv.dairy ?? [], inv.advancePaise ?? 0, session, String(inv.customerId), inv.taxMode ?? 'GST',
        opts.asOf, inv.totals?.discountPaise ?? 0);
      if (b.totals.finalPayable !== inv.totals.finalPayable || canonicalJson(b.lines) !== canonicalJson(inv.lines)
        || canonicalJson(b.exchanges) !== canonicalJson(inv.exchanges ?? []))
        throw new ConflictException({ code: 'PRICE_CHANGED', message: 'Prices or exchange rates changed since this draft was saved. Review and save the draft again.', quote: b });

      const payable = b.totals.finalPayable;
      const received = sum(dto.payments);
      const duePaise = payable - received - b.advancePaise;           // whatever is left unpaid
      if (duePaise < 0) throw new BadRequestException('Payments plus advance exceed the net payable');
      if (duePaise > 0) {
        if (!dto.allowDue)
          throw new BadRequestException(`Payments (${formatINR(received)}) + advance (${formatINR(b.advancePaise)}) must equal net payable (${formatINR(payable)}). To leave a balance as customer due, set allowDue.`);
        if (user.role === 'STAFF') throw new ForbiddenException('Only the owner or admin can sell on credit');
      }
      // await this.assertCashLimit(dto.payments, inv.customerId, session);

      const number = await this.nextNumber(inv.branchId, inv.taxMode === 'NON_GST' ? 'BOS' : 'INV', session);
      let negativeStock = false;
      for (const l of b.lines) {
        try {
          const mv = await this.inventory.move({ productId: String(l.productId), branchId: String(inv.branchId), type: 'SALE',
            qty: -l.qty, refType: 'INVOICE', refId: String(inv._id), actorId: user.id, allowNegative: opts.allowNegativeStock }, session);
          if (mv.stock.qty < 0) negativeStock = true;
        } catch (e: any) {
          if (e.message === 'Insufficient stock') throw new BadRequestException(`Insufficient stock for ${l.sku}`);
          throw e;
        }
      }

      let exchangeIds: Types.ObjectId[] = [];
      if (b.exchanges.length) {
        const ex = await this.exchange.record({
          invoiceId: inv._id, invoiceNumber: number, branchId: inv.branchId, customerId: inv.customerId,
          items: b.exchanges, editHistory: inv.exchangeEdits ?? [], userId: user.id }, session);
        exchangeIds = [ex._id];
      }

      // Dairy redemption: guarded debit + ledger entry linked to this invoice (same transaction)
      const dairyLedgerIds: Types.ObjectId[] = [];
      for (const d of b.dairy)
        dairyLedgerIds.push(await this.dairy.redeem({ schemeId: d.schemeId, amountPaise: d.amountPaise,
          customerId: String(inv.customerId), invoiceId: String(inv._id), invoiceNumber: number, actorId: user.id }, session));

      // Customer accounts (separate from dairy): advance used, due created Ã¢â‚¬â€ same transaction
      if (b.advancePaise)
        await this.accounts.useAdvance(String(inv.customerId), b.advancePaise, { invoiceId: String(inv._id), invoiceNumber: number, userId: user.id }, session);
      if (duePaise)
        await this.accounts.addDue(String(inv.customerId), duePaise, { invoiceId: String(inv._id), invoiceNumber: number, userId: user.id }, session);

      const finalizedAt = opts.finalizedAt ?? new Date();

      const hashInput = {
        number, type: 'SALE', taxMode: inv.taxMode ?? 'GST',
        branchId: inv.branchId, customerId: inv.customerId, lines: b.lines,
        exchanges: b.exchanges, dairy: b.dairy, advancePaise: b.advancePaise,
        duePaise, totals: b.totals, payments: dto.payments, rates: b.rates,
        finalizedAt,
      };
      const hash = computeHash(hashInput);
      const done = await this.model.findOneAndUpdate({ _id: inv._id, status: 'DRAFT' }, {
        $set: { status: 'FINAL', locked: true, number, lines: b.lines, exchanges: b.exchanges, exchangeIds, dairy: b.dairy, dairyLedgerIds, advancePaise: b.advancePaise, duePaise,
          totals: b.totals, rates: b.rates, payments: dto.payments, finalizedAt, finalizedBy: new Types.ObjectId(user.id),
          contentHash: hash, ...(dto.remarks !== undefined && { remarks: dto.remarks }),
          ...(opts.offline && { offline: true, provisionalNo: opts.offline.provisionalNo, deviceId: opts.offline.deviceId, negativeStock }) },
      }, { new: true, session });
      if (!done) throw new ConflictException('Invoice was modified concurrently');
      return done;
    });
  }

  // ---------------- credit note (full reversal) ----------------
  creditNote(id: string, dto: CreditNoteDto, user: AuthUser) {
    return this.conn.transaction(async session => {
      const orig = await this.load(id, user, session);
      if (orig.type !== 'SALE' || orig.status !== 'FINAL') throw new BadRequestException('Only finalized sale invoices can be credited');
      if (orig.exchanges?.length)
        throw new BadRequestException('Invoices that include an old-metal exchange cannot be credited automatically yet. Handle the metal return manually.');
      if (orig.dairy?.length)
        throw new BadRequestException('Invoices that used a dairy adjustment cannot be credited automatically yet. Re-credit the dairy scheme with an admin adjustment.');
      if (orig.advancePaise || orig.duePaise)
        throw new BadRequestException('Invoices that used a customer advance or left a due cannot be credited automatically yet. Settle the advance/due manually first.');
      if (await this.model.exists({ creditNoteOf: orig._id }).session(session)) throw new ConflictException('Invoice already credited');
      if (sum(dto.refunds) !== orig.totals.finalPayable)
        throw new BadRequestException(`Refunds (${formatINR(sum(dto.refunds))}) must equal the invoice amount (${formatINR(orig.totals.finalPayable)})`);

      const _id = new Types.ObjectId();
      const number = await this.nextNumber(orig.branchId, orig.taxMode === 'NON_GST' ? 'BOSCN' : 'CN', session);
      for (const l of orig.lines)
        await this.inventory.move({ productId: String(l.productId), branchId: String(orig.branchId), type: 'RETURN',
          qty: l.qty, refType: 'CREDIT_NOTE', refId: String(_id), note: dto.reason, actorId: user.id }, session);

      const totals = negate(orig.totals);
      const payments = dto.refunds.map(r => ({ ...r, amountPaise: -r.amountPaise })); // refunds are negative receipts
      const finalizedAt = new Date();
      const hash = computeHash({ number, type: 'CREDIT_NOTE', taxMode: orig.taxMode ?? 'GST', branchId: orig.branchId, customerId: orig.customerId,
        lines: orig.lines, totals, payments, rates: orig.rates, creditNoteOf: orig._id, finalizedAt });
      const [cn] = await this.model.create([{
        _id, branchId: orig.branchId, type: 'CREDIT_NOTE', taxMode: orig.taxMode ?? 'GST', number, status: 'FINAL', locked: true,
        customerId: orig.customerId, lines: orig.lines, rates: orig.rates, totals, payments, creditNoteOf: orig._id,
        reason: dto.reason, finalizedAt, finalizedBy: new Types.ObjectId(user.id), contentHash: hash,
        createdBy: new Types.ObjectId(user.id),
      } as any], { session });
      return cn;
    });
  }

  // ---------------- reads ----------------
  async get(id: string, user: AuthUser) { return this.load(id, user); }

  async list(q: InvoiceQueryDto, user: AuthUser) {
    const f: Record<string, any> = {};
    if (q.branchId) f.branchId = new Types.ObjectId(q.branchId);
    else if (user.role !== 'ADMIN') f.branchId = { $in: user.branchIds.map(i => new Types.ObjectId(i)) };
    if (user.role === 'STAFF') f.createdBy = new Types.ObjectId(user.id);
    if (q.status) f.status = q.status;
    if (q.type) f.type = q.type;
    if (q.taxMode) f.taxMode = q.taxMode;
    if (q.q) f.number = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (q.from || q.to) f.createdAt = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
    const [items, total] = await Promise.all([
      this.model.find(f).select('number status type taxMode branchId customerId totals.finalPayable finalizedAt createdAt')
        .sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      this.model.countDocuments(f),
    ]);
    const who = await this.customers.names(items.map(i => i.customerId));
    return { items: items.map(i => ({ ...i, customer: who.get(String(i.customerId)) ?? null })), total, page: q.page, limit: q.limit };
  }

  /**
   * The ONLY shape that may leave the building (PDF, share, print). Old metal appears as an amount and,
   * only if the branch allows, the total fine weight (jama) Ã¢â‚¬â€ never gross/less/net weight, purity or rate.
   */

  /**
   * The ONLY shape that may leave the building (PDF, share, print).
   * Old metal appears as an amount and, only if the branch allows,
   * the total fine weight (jama).
   */
  async customerView(id: string, user: AuthUser) {
    const inv = await this.load(id, user);

    const [customer, branch] = await Promise.all([
      inv.customerId
        ? this.customers.findOne(String(inv.customerId))
        : null,
      this.branches.findOne(String(inv.branchId)),
    ]);

    const lines = inv.lines.map(l => ({
      name: l.name,
      sku: l.sku,
      metalValue: l.metalValue + l.stoneValue,
      making: l.making,
      hsn: l.hsn,
      qty: l.qty,
      karat: l.karat,
      purityPct: l.purityPct,
      grossMg: l.grossMg,
      netMg: l.netMg,
    }));

    const against = inv.creditNoteOf
      ? (await this.model.findById(inv.creditNoteOf).select('number').lean())?.number
      : undefined;

    const fine = (metal: string) =>
      (inv.exchanges ?? [])
        .filter(e => e.metal === metal)
        .reduce((s, e) => s + e.fineMg, 0);

    const customerInvoice = toCustomerInvoice(
      { ...inv.totals, exchangeDetail: [] },
      lines,
      { customer: customer?.name ?? '', remarks: inv.remarks },
      {
        exchangeDisplay: branch.exchangeDisplay,
        goldFineMg: fine('GOLD'),
        silverFineMg: fine('SILVER'),
        settlement: inv.status === 'FINAL'
          ? {
              advance: inv.advancePaise ?? 0,
              received: sum(inv.payments),
              due: inv.duePaise ?? 0,
            }
          : undefined,
      },
    );

    return {
      document: {
        number: inv.number ?? null,
        type: inv.type,
        status: inv.status,
        date: inv.finalizedAt ?? inv.createdAt,
        taxMode: inv.taxMode ?? 'GST',
        ...(inv.type === 'CREDIT_NOTE' && {
          reason: inv.reason,
          againstInvoice: against,
        }),
      },
      branch: {
        name: branch.name,
        address: branch.address,
        whatsappNumber: branch.whatsappNumber,
        gstin: branch.gstin,
        state: branch.state,
        invoicePaper: branch.invoicePaper ?? 'A4',
      },
      ...customerInvoice,
      customer: customer
        ? {
            id: String(customer._id),
            name: customer.name,
            mobile: customer.mobile,
            address: customer.address,
          }
        : null,
    };
  }

  /** A4 PDF built from the customer-safe view only. FINAL invoices are integrity-checked against their stored hash first. */
  async pdfFor(id: string, user: AuthUser, size?: 'A4' | 'A5') {
    const inv = await this.load(id, user);
    if (inv.status === 'FINAL' && inv.contentHash && computeHash(inv.toObject()) !== inv.contentHash)
      throw new ConflictException('Invoice integrity check failed Ã¢â‚¬â€ the stored invoice was altered. Contact the administrator.');
    const view = await this.customerView(id, user);
    const buffer = await this.pdf.render(this.pdf.invoiceDoc(view, inv.status === 'DRAFT', size ?? view.branch.invoicePaper));
    return { buffer, filename: `${inv.number ?? `DRAFT-${id}`}.pdf` };
  }

  async verify(id: string, user: AuthUser) {
    const inv = await this.model.findById(id).lean();
    if (!inv) throw new NotFoundException('Invoice not found');
    this.assertAccess(user, inv);
    if (!inv.contentHash) return { ok: false, reason: 'Not finalized' };
    return { ok: computeHash(inv) === inv.contentHash };
  }
}
