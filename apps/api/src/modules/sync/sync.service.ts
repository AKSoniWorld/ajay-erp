import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Model, Types } from 'mongoose';
import { AuthUser, hasPermission } from '@ajay/shared';
import { Category } from '../catalog/category.schema';
import { Product } from '../catalog/product.schema';
import { Customer } from '../customers/customer.schema';
import { CustomersService } from '../customers/customers.service';
import { DairyScheme } from '../dairy/dairy.schema';
import { DairyService } from '../dairy/dairy.service';
import { BranchStock } from '../inventory/stock.schema';
import { PosService } from '../pos/pos.service';
import { RatesService } from '../rates/rates.service';
import { OfflineDairyDto, OfflineSaleDto, OpsQueryDto, PullQueryDto, PushDto, SyncOpDto } from './dto/sync.dto';
import { SyncOp } from './sync.schema';

const oid = (s: any) => new Types.ObjectId(String(s));
const STALE_PROCESSING_MS = 2 * 60_000;
const MAX_AGE_MS = 30 * 86_400_000, MAX_FUTURE_MS = 5 * 60_000;
export const PULL_COLLECTIONS = ['products', 'categories', 'customers', 'stock', 'dairy', 'rates'] as const;
type Outcome = { status: 'APPLIED' | 'NEEDS_REVIEW'; result: Record<string, unknown>; error?: string };
const errText = (e: any) => String(e?.response?.message ?? e?.message ?? e);

/**
 * Offline-first sync (server side).
 *  PUSH: operations from a device, applied in order, each idempotent by clientUuid. A sale is re-priced with the rates in force
 *        when it was made; if that differs from what the customer was charged it is kept as a DRAFT and flagged NEEDS_REVIEW.
 *        Stock may go negative (flagged). Official invoice numbers are issued here; the device's provisional number is kept.
 *  PULL: per-collection incremental download of master data (products, customers, rates, stock, dairyÃ¢â‚¬Â¦).
 *  Masters: last write wins on the server; devices never push master edits, so there is nothing to merge from them.
 */
@Injectable()
export class SyncService {
  constructor(
    @InjectModel(SyncOp.name) private ops: Model<SyncOp>,
    @InjectModel(Product.name) private products: Model<Product>,
    @InjectModel(Category.name) private categories: Model<Category>,
    @InjectModel(Customer.name) private customersModel: Model<Customer>,
    @InjectModel(BranchStock.name) private stock: Model<BranchStock>,
    @InjectModel(DairyScheme.name) private schemes: Model<DairyScheme>,
    private pos: PosService, private dairy: DairyService, private customers: CustomersService, private rates: RatesService,
  ) {}

  // ---------------- push ----------------
  async push(user: AuthUser, dto: PushDto) {
    const results = [];
    for (const op of dto.ops) results.push(await this.processOp(user, dto.deviceId, op));   // in order
    return { results, serverTime: new Date() };
  }

  private view(r: any) {
    return { clientUuid: r.clientUuid, status: r.status, ...(r.result ?? {}), ...(r.error && { error: r.error }) };
  }

  private async processOp(user: AuthUser, deviceId: string, op: SyncOpDto) {
    let rec: any = await this.ops.findOne({ clientUuid: op.clientUuid });
    if (rec) {
      if (String(rec.userId) !== user.id && user.role !== 'ADMIN')
        return { clientUuid: op.clientUuid, status: 'FAILED', error: 'This operation belongs to another user' };
      const stale = rec.status === 'PROCESSING' && Date.now() - rec.updatedAt.getTime() > STALE_PROCESSING_MS;
      if (rec.status !== 'FAILED' && !stale) return this.view(rec);                         // idempotent replay: return what we did
      rec = await this.ops.findOneAndUpdate({ _id: rec._id, status: rec.status }, { $set: { status: 'PROCESSING', error: undefined, payload: op.payload } }, { new: true });
      if (!rec) return { clientUuid: op.clientUuid, status: 'PROCESSING' };                  // someone else took it
    } else {
      try {
        rec = await this.ops.create({ clientUuid: op.clientUuid, deviceId, userId: oid(user.id), type: op.type, payload: op.payload,
          branchId: (op.payload as any)?.branchId && Types.ObjectId.isValid((op.payload as any).branchId) ? oid((op.payload as any).branchId) : undefined });
      } catch (e: any) {
        if (e.code === 11000) return this.view(await this.ops.findOne({ clientUuid: op.clientUuid }));   // parallel duplicate
        throw e;
      }
    }
    let status: string, result: Record<string, unknown> | undefined, error: string | undefined;
    try {
      const out = op.type === 'SALE' ? await this.applySale(user, deviceId, op) : await this.applyDairy(user, op);
      status = out.status; result = out.result; error = out.error;
    } catch (e: any) { status = 'FAILED'; error = errText(e); }
    rec = await this.ops.findOneAndUpdate({ _id: rec._id }, { $set: { status, result, error, ...(status === 'APPLIED' && { appliedAt: new Date() }) } }, { new: true });
    return this.view(rec);
  }

  private async check<T extends object>(cls: new () => T, payload: unknown): Promise<T> {
    const inst = plainToInstance(cls, payload);
    const errs = await validate(inst as object, { whitelist: true, forbidNonWhitelisted: true });
    if (errs.length) throw new BadRequestException(errs.flatMap(e => Object.values(e.constraints ?? { x: `${e.property} is invalid` })).join('; '));
    return inst;
  }

  private async applySale(user: AuthUser, deviceId: string, op: SyncOpDto): Promise<Outcome> {
    const dto = await this.check(OfflineSaleDto, op.payload);
    if (!hasPermission(user.role, 'invoice.create') || !hasPermission(user.role, 'invoice.finalize')) throw new ForbiddenException('Not allowed to sell');
    if (user.role !== 'ADMIN' && !user.branchIds.includes(dto.branchId)) throw new ForbiddenException('Branch access denied');
    const asOf = new Date(dto.offlineAt), now = Date.now();
    if (asOf.getTime() > now + MAX_FUTURE_MS) throw new BadRequestException('offlineAt is in the future Ã¢â‚¬â€ check the device clock');
    if (asOf.getTime() < now - MAX_AGE_MS) throw new BadRequestException('offlineAt is older than 30 days Ã¢â‚¬â€ enter this sale manually');

    let customerId = dto.customerId;
    if (!customerId && dto.customer) customerId = String((await this.customers.upsertByMobile(dto.customer, user.id)).customer._id);
    if (!customerId) throw new BadRequestException('Customer is required');

    // Re-price with the rates that were in force when the sale was made (not today's)
    const draft: any = await this.pos.createDraft({ branchId: dto.branchId, customerId, lines: dto.lines, exchanges: dto.exchanges,
      dairy: dto.dairy, advancePaise: dto.advancePaise, discountPaise: dto.discountPaise, taxMode: dto.taxMode,
      remarks: dto.remarks, clientUuid: op.clientUuid } as any, user, { asOf });
    const base = { invoiceId: String(draft._id), provisionalNo: dto.provisionalNo };
    if (draft.totals.finalPayable !== dto.clientTotals.finalPayable)
      return { status: 'NEEDS_REVIEW', result: base, error: `Price differs: the device charged ${dto.clientTotals.finalPayable} paise, the server prices this sale at ${draft.totals.finalPayable} paise (rates as of the sale time). The draft is kept for review.` };
    try {
      const inv: any = await this.pos.finalize(String(draft._id), { payments: dto.payments, allowDue: dto.allowDue, remarks: dto.remarks } as any, user,
        { asOf, finalizedAt: asOf, allowNegativeStock: true, offline: { provisionalNo: dto.provisionalNo, deviceId } });
      return { status: 'APPLIED', result: { ...base, invoiceNumber: inv.number, negativeStock: !!inv.negativeStock } };
    } catch (e: any) {
      return { status: 'NEEDS_REVIEW', result: base, error: `Could not finalize: ${errText(e)}. The draft is kept for review.` };
    }
  }

  private async applyDairy(user: AuthUser, op: SyncOpDto): Promise<Outcome> {
    const dto = await this.check(OfflineDairyDto, op.payload);
    if (!hasPermission(user.role, 'dairy.collect')) throw new ForbiddenException('Not allowed to collect dairy payments');
    const r: any = await this.dairy.collect(dto.schemeId, { amountPaise: dto.amountPaise, mode: dto.mode, ref: dto.ref }, user);   // branch access is checked inside
    return { status: 'APPLIED', result: { receiptNo: r.receiptNo } };
  }

  // ---------------- review queue ----------------
  async listOps(user: AuthUser, q: OpsQueryDto) {
    const f: Record<string, any> = { status: q.status ?? { $in: ['NEEDS_REVIEW', 'FAILED'] } };
    if (q.branchId) f.branchId = oid(q.branchId);
    else if (user.role !== 'ADMIN') f.branchId = { $in: user.branchIds.map(oid) };
    const [items, total] = await Promise.all([
      this.ops.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), this.ops.countDocuments(f)]);
    return { items, total, page: q.page, limit: q.limit };
  }

  async resolve(id: string, note: string, user: AuthUser) {
    const op = await this.ops.findById(id);
    if (!op || (user.role !== 'ADMIN' && !(op.branchId && user.branchIds.includes(String(op.branchId))))) throw new NotFoundException('Operation not found');
    const upd = await this.ops.findOneAndUpdate({ _id: id, status: { $in: ['NEEDS_REVIEW', 'FAILED'] } },
      { $set: { status: 'RESOLVED', resolvedBy: oid(user.id), resolvedAt: new Date(), resolveNote: note } }, { new: true });
    if (!upd) throw new BadRequestException('Only operations that need review can be resolved');
    return upd;
  }

  // ---------------- pull ----------------
  /** Incremental download. Use `nextSince` as the next `since`; rows are re-sent when equal to it, so devices upsert by _id. */
  async pull(user: AuthUser, collection: string, q: PullQueryDto) {
    if (!(PULL_COLLECTIONS as readonly string[]).includes(collection)) throw new BadRequestException(`Unknown collection. Use: ${PULL_COLLECTIONS.join(', ')}`);
    if (q.branchId && user.role !== 'ADMIN' && !user.branchIds.includes(q.branchId)) throw new ForbiddenException('Branch access denied');
    const serverTime = new Date();                                  // taken BEFORE reading, so nothing slips between pulls
    const since = q.since ? new Date(q.since) : new Date(0), limit = Math.min(q.limit ?? 500, 2000), page = limit + 1;
    if (collection === 'rates') return { collection, items: [await this.rates.current()], hasMore: false, nextSince: serverTime, serverTime };
    let items: any[];
    const f = { updatedAt: { $gte: since } };
    switch (collection) {
      case 'products': items = await this.products.find(f).sort({ updatedAt: 1 }).limit(page).lean(); break;
      case 'categories': items = await this.categories.find(f).sort({ updatedAt: 1 }).limit(page).lean(); break;
      case 'customers': items = await this.customersModel.find(f).select('name mobile address remarks updatedAt').sort({ updatedAt: 1 }).limit(page).lean(); break;
      case 'stock':
        if (!q.branchId) throw new BadRequestException('branchId is required for stock');
        items = await this.stock.find({ branchId: oid(q.branchId), ...f }).sort({ updatedAt: 1 }).limit(page).lean(); break;
      default:   // dairy: balances so a device can offer dairy on a bill
        items = await this.schemes.find(f).select('schemeNo customerId branchId balancePaise paidPaise monthlyPaise durationMonths startDate schemeType bonusCreditedAt bonusForfeitedAt updatedAt')
          .sort({ updatedAt: 1 }).limit(page).lean();
    }
    const hasMore = items.length > limit;
    if (hasMore) items = items.slice(0, limit);
    return { collection, items, hasMore, nextSince: hasMore ? items[items.length - 1].updatedAt : serverTime, serverTime };
  }
}
