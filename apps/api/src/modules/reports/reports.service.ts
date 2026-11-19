import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthUser } from '@ajay/shared';
import { istRange } from '../../common/utils/time';
import { CustomerLedger } from '../accounts/account.schema';
import { Branch } from '../branches/branch.schema';
import { Product } from '../catalog/product.schema';
import { Customer } from '../customers/customer.schema';
import { DairyLedger, DairyPayment, DairyScheme } from '../dairy/dairy.schema';
import { Exchange } from '../exchange/exchange.schema';
import { RawStock } from '../exchange/raw.schema';
import { BranchStock, StockMovement } from '../inventory/stock.schema';
import { Invoice } from '../pos/invoice.schema';
import { Supplier, SupplierLedger } from '../suppliers/supplier.schema';
import { Report } from './report.types';
import { ReportQueryDto } from './reports.dto';

const oid = (s: any) => new Types.ObjectId(String(s));
const MAX_ROWS = 5000;
const sumOf = (rows: any[], keys: string[]) => Object.fromEntries(keys.map(k => [k, rows.reduce((s, r) => s + (r[k] ?? 0), 0)]));

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Invoice.name) readonly invoices: Model<Invoice>,
    @InjectModel(Exchange.name) private exchanges: Model<Exchange>,
    @InjectModel(StockMovement.name) private movements: Model<StockMovement>,
    @InjectModel(BranchStock.name) readonly stock: Model<BranchStock>,
    @InjectModel(RawStock.name) readonly rawStock: Model<RawStock>,
    @InjectModel(DairyPayment.name) readonly dairyPayments: Model<DairyPayment>,
    @InjectModel(DairyScheme.name) readonly dairySchemes: Model<DairyScheme>,
    @InjectModel(DairyLedger.name) private dairyLedger: Model<DairyLedger>,
    @InjectModel(CustomerLedger.name) private custLedger: Model<CustomerLedger>,
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(SupplierLedger.name) private supLedger: Model<SupplierLedger>,
    @InjectModel(Supplier.name) private supModel: Model<Supplier>,
    @InjectModel(Product.name) private products: Model<Product>,
    @InjectModel(Branch.name) private branches: Model<Branch>,
  ) {}

  // ---------- helpers ----------
  range(q: { from?: string; to?: string }) {
    const r = istRange(q.from, q.to);
    if (!r.valid || r.from >= r.to) throw new BadRequestException('Invalid date range');
    if (r.to.getTime() - r.from.getTime() > 366 * 86_400_000) throw new BadRequestException('Date range is limited to 366 days');
    return r;
  }
  branchMatch(user: AuthUser, branchId?: string) {
    if (branchId) return oid(branchId);
    return user.role === 'ADMIN' ? undefined : { $in: user.branchIds.map(oid) };
  }
  async branchNames() {
    return new Map((await this.branches.find().select('name').lean()).map(b => [String(b._id), b.name]));
  }
  private guard<T>(rows: T[]) {
    if (rows.length > MAX_ROWS) throw new BadRequestException(`More than ${MAX_ROWS} rows — narrow the dates or pick a branch`);
    return rows;
  }
  private async nameMap(model: Model<any>, ids: any[], field: string) {
    const uniq = [...new Set(ids.filter(Boolean).map(String))];
    if (!uniq.length) return new Map<string, string>();
    return new Map((await model.find({ _id: { $in: uniq.map(oid) } }).select(field).lean()).map((d: any) => [String(d._id), d[field]]));
  }

  /** Invoice aggregates shared by sales, comparison and the dashboard. Credit notes count as returns (their totals are negative). */
  invoiceGroups(match: any, _id: any, sort: any = {}): Promise<any[]> {
    const sale = { $eq: ['$type', 'SALE'] }, cn = { $eq: ['$type', 'CREDIT_NOTE'] };
    return this.invoices.aggregate([{ $match: match }, { $group: { _id,
      invoices: { $sum: { $cond: [sale, 1, 0] } },
      salesPaise: { $sum: { $cond: [sale, '$totals.finalPayable', 0] } },
      returnsPaise: { $sum: { $cond: [cn, { $multiply: ['$totals.finalPayable', -1] }, 0] } },
      gstPaise: { $sum: '$totals.gst' },
      exchangePaise: { $sum: { $add: [{ $ifNull: ['$totals.goldExchange', 0] }, { $ifNull: ['$totals.silverExchange', 0] }] } },
      dairyPaise: { $sum: { $ifNull: ['$totals.dairy', 0] } },
      advancePaise: { $sum: { $ifNull: ['$advancePaise', 0] } },
      duePaise: { $sum: { $ifNull: ['$duePaise', 0] } },
    } }, ...(Object.keys(sort).length ? [{ $sort: sort }] : [])]) as any;
  }

  // ---------- 1. sales (daily / monthly) — GST and non-GST kept apart ----------
  async sales(q: ReportQueryDto, user: AuthUser): Promise<Report> {
    const r = this.range(q), names = await this.branchNames();
    const and: any[] = [{ status: 'FINAL', finalizedAt: { $gte: r.from, $lt: r.to } }];
    const bm = this.branchMatch(user, q.branchId); if (bm) and.push({ branchId: bm });
    if (q.taxMode) and.push(q.taxMode === 'GST' ? { $or: [{ taxMode: 'GST' }, { taxMode: { $exists: false } }] } : { taxMode: 'NON_GST' });
    if (user.role === 'STAFF') and.push({ createdBy: oid(user.id) });        // POS staff: their own sales only
    const fmt = q.granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const groups = await this.invoiceGroups({ $and: and }, {
      period: { $dateToString: { format: fmt, date: '$finalizedAt', timezone: 'Asia/Kolkata' } },
      branchId: '$branchId', taxMode: { $ifNull: ['$taxMode', 'GST'] } }, { '_id.period': 1, '_id.taxMode': 1 });
    const rows = groups.map(g => ({ period: g._id.period, branch: names.get(String(g._id.branchId)) ?? '', taxMode: g._id.taxMode,
      invoices: g.invoices, salesPaise: g.salesPaise, returnsPaise: g.returnsPaise, netPaise: g.salesPaise - g.returnsPaise, gstPaise: g.gstPaise,
      exchangePaise: g.exchangePaise, dairyPaise: g.dairyPaise, advancePaise: g.advancePaise, duePaise: g.duePaise }));
    return { title: `${q.granularity === 'month' ? 'Monthly' : 'Daily'} sales`, period: { from: r.fromStr, to: r.toStr },
      columns: [
        { key: 'period', label: q.granularity === 'month' ? 'Month' : 'Date', type: 'text' }, { key: 'branch', label: 'Branch', type: 'text' },
        { key: 'taxMode', label: 'Type', type: 'text' }, { key: 'invoices', label: 'Bills', type: 'int' },
        { key: 'salesPaise', label: 'Sales', type: 'money' }, { key: 'returnsPaise', label: 'Returns', type: 'money' },
        { key: 'netPaise', label: 'Net sales', type: 'money' }, { key: 'gstPaise', label: 'GST', type: 'money' },
        { key: 'exchangePaise', label: 'Old metal', type: 'money' }, { key: 'dairyPaise', label: 'Dairy used', type: 'money' },
        { key: 'advancePaise', label: 'Advance used', type: 'money' }, { key: 'duePaise', label: 'Left due', type: 'money' }],
      rows, totals: sumOf(rows, ['invoices', 'salesPaise', 'returnsPaise', 'netPaise', 'gstPaise', 'exchangePaise', 'dairyPaise', 'advancePaise', 'duePaise']),
      meta: { note: 'GST invoices and bills of supply (NON_GST) are listed separately; filter with taxMode.' } };
  }

  // ---------- 2. branch comparison ----------
  async branchComparison(q: ReportQueryDto): Promise<Report> {
    const r = this.range(q), names = await this.branchNames();
    const inRange = { status: 'FINAL', finalizedAt: { $gte: r.from, $lt: r.to } };
    const [groups, stock, collected] = await Promise.all([
      this.invoiceGroups(inRange, { branchId: '$branchId', taxMode: { $ifNull: ['$taxMode', 'GST'] } }),
      this.stock.aggregate([{ $group: { _id: '$branchId', pieces: { $sum: '$qty' } } }]),
      this.dairyPayments.aggregate([{ $match: { at: { $gte: r.from, $lt: r.to } } }, { $group: { _id: '$branchId', amount: { $sum: '$amountPaise' } } }]),
    ]);
    const rows = [...names].map(([id, branch]) => {
      const gs = groups.filter(g => String(g._id.branchId) === id), t = sumOf(gs.map(g => g), ['invoices', 'salesPaise', 'returnsPaise', 'gstPaise', 'exchangePaise', 'dairyPaise']);
      const net = (m: string) => gs.filter(g => g._id.taxMode === m).reduce((s, g) => s + g.salesPaise - g.returnsPaise, 0);
      return { branch, invoices: t.invoices, salesPaise: t.salesPaise, returnsPaise: t.returnsPaise, netPaise: t.salesPaise - t.returnsPaise,
        netGstPaise: net('GST'), netNonGstPaise: net('NON_GST'), gstPaise: t.gstPaise,
        avgBillPaise: t.invoices ? Math.round((t.salesPaise - t.returnsPaise) / t.invoices) : 0, exchangePaise: t.exchangePaise, dairyUsedPaise: t.dairyPaise,
        dairyCollectedPaise: collected.find(c => String(c._id) === id)?.amount ?? 0, stockPieces: stock.find(s => String(s._id) === id)?.pieces ?? 0 };
    }).sort((a, b) => b.netPaise - a.netPaise);
    return { title: 'Branch comparison', period: { from: r.fromStr, to: r.toStr },
      columns: [
        { key: 'branch', label: 'Branch', type: 'text' }, { key: 'invoices', label: 'Bills', type: 'int' }, { key: 'salesPaise', label: 'Sales', type: 'money' },
        { key: 'returnsPaise', label: 'Returns', type: 'money' }, { key: 'netPaise', label: 'Net sales', type: 'money' },
        { key: 'netGstPaise', label: 'Net (GST bills)', type: 'money' }, { key: 'netNonGstPaise', label: 'Net (no-GST bills)', type: 'money' },
        { key: 'gstPaise', label: 'GST', type: 'money' }, { key: 'avgBillPaise', label: 'Avg bill', type: 'money' },
        { key: 'exchangePaise', label: 'Old metal', type: 'money' }, { key: 'dairyUsedPaise', label: 'Dairy used', type: 'money' },
        { key: 'dairyCollectedPaise', label: 'Dairy collected', type: 'money' }, { key: 'stockPieces', label: 'Stock (pcs)', type: 'int' }],
      rows, totals: sumOf(rows, ['invoices', 'salesPaise', 'returnsPaise', 'netPaise', 'netGstPaise', 'netNonGstPaise', 'gstPaise', 'exchangePaise', 'dairyUsedPaise', 'dairyCollectedPaise', 'stockPieces']) };
  }

  // ---------- 3/4. old gold / old silver (internal: weights and rates) ----------
  async oldMetal(metal: 'GOLD' | 'SILVER', q: ReportQueryDto, user: AuthUser): Promise<Report> {
    const r = this.range(q), names = await this.branchNames();
    const match: any = { at: { $gte: r.from, $lt: r.to } };
    const bm = this.branchMatch(user, q.branchId); if (bm) match.branchId = bm;
    const docs: any[] = this.guard(await this.exchanges.aggregate([{ $match: match }, { $unwind: '$items' }, { $match: { 'items.metal': metal } },
      { $sort: { at: 1 } }, { $limit: MAX_ROWS + 1 }]));
    const cust = await this.nameMap(this.customers, docs.map(d => d.customerId), 'name');
    const rows = docs.map(d => ({ date: d.at, invoiceNumber: d.invoiceNumber, branch: names.get(String(d.branchId)) ?? '', customer: cust.get(String(d.customerId)) ?? '',
      grossMg: d.items.grossMg, lessMg: d.items.lessMg, netMg: d.items.netMg, purityPct: d.items.purityPct, fineMg: d.items.fineMg,
      ratePerGramPaise: d.items.ratePerGramPaise, valuePaise: d.items.valuePaise, remarks: d.items.remarks ?? '' }));
    const rs: any = { metal }; if (bm) rs.branchId = bm;
    const stock = (await this.rawStock.find(rs).lean()).map(s => ({ branch: names.get(String(s.branchId)) ?? '', netMg: s.netMg, fineMg: s.fineMg }));
    return { title: `Old ${metal === 'GOLD' ? 'gold' : 'silver'} report`, period: { from: r.fromStr, to: r.toStr },
      columns: [
        { key: 'date', label: 'Date', type: 'date' }, { key: 'invoiceNumber', label: 'Invoice', type: 'text' }, { key: 'branch', label: 'Branch', type: 'text' },
        { key: 'customer', label: 'Customer', type: 'text' }, { key: 'grossMg', label: 'Gross g', type: 'weight' }, { key: 'lessMg', label: 'Less g', type: 'weight' },
        { key: 'netMg', label: 'Net g', type: 'weight' }, { key: 'purityPct', label: 'Purity %', type: 'pct' }, { key: 'fineMg', label: 'Fine g', type: 'weight' },
        { key: 'ratePerGramPaise', label: 'Rate /g', type: 'money' }, { key: 'valuePaise', label: 'Value', type: 'money' }, { key: 'remarks', label: 'Remarks', type: 'text' }],
      rows, totals: sumOf(rows, ['grossMg', 'lessMg', 'netMg', 'fineMg', 'valuePaise']), meta: { rawStockNow: stock } };
  }

  // ---------- 5. dairy collection ----------
  async dairyCollection(q: ReportQueryDto, user: AuthUser): Promise<Report> {
    const r = this.range(q), names = await this.branchNames();
    const match: any = { at: { $gte: r.from, $lt: r.to } };
    const bm = this.branchMatch(user, q.branchId); if (bm) match.branchId = bm;
    const pays: any[] = this.guard(await this.dairyPayments.find(match).sort({ at: 1 }).limit(MAX_ROWS + 1).lean());
    const [sch, cust] = await Promise.all([this.nameMap(this.dairySchemes, pays.map(p => p.schemeId), 'schemeNo'), this.nameMap(this.customers, pays.map(p => p.customerId), 'name')]);
    const rows = pays.map(p => ({ date: p.at, branch: names.get(String(p.branchId)) ?? '', receiptNo: p.receiptNo, schemeNo: sch.get(String(p.schemeId)) ?? '',
      customer: cust.get(String(p.customerId)) ?? '', mode: p.mode, monthsCovered: p.monthsCovered, amountPaise: p.amountPaise }));
    const byMode: Record<string, number> = {}; rows.forEach(x => { byMode[x.mode] = (byMode[x.mode] ?? 0) + x.amountPaise; });
    return { title: 'Dairy collection', period: { from: r.fromStr, to: r.toStr },
      columns: [
        { key: 'date', label: 'Date', type: 'date' }, { key: 'branch', label: 'Branch', type: 'text' }, { key: 'receiptNo', label: 'Receipt', type: 'text' },
        { key: 'schemeNo', label: 'Scheme', type: 'text' }, { key: 'customer', label: 'Customer', type: 'text' }, { key: 'mode', label: 'Mode', type: 'text' },
        { key: 'monthsCovered', label: 'Instalments', type: 'int' }, { key: 'amountPaise', label: 'Amount', type: 'money' }],
      rows, totals: sumOf(rows, ['monthsCovered', 'amountPaise']), meta: { byMode } };
  }

  // ---------- 6. stock movement ----------
  async stockMovement(q: ReportQueryDto, user: AuthUser): Promise<Report> {
    const r = this.range(q), names = await this.branchNames();
    const match: any = { at: { $gte: r.from, $lt: r.to } };
    const bm = this.branchMatch(user, q.branchId); if (bm) match.branchId = bm;
    if (q.type) match.type = q.type;
    if (q.productId) match.productId = oid(q.productId);
    const mv: any[] = this.guard(await this.movements.find(match).sort({ at: 1 }).limit(MAX_ROWS + 1).lean());
    const prods = new Map((await this.products.find({ _id: { $in: [...new Set(mv.map(m => String(m.productId)))].map(oid) } }).select('sku name').lean()).map(p => [String(p._id), p]));
    const rows = mv.map(m => ({ date: m.at, branch: names.get(String(m.branchId)) ?? '', sku: prods.get(String(m.productId))?.sku ?? '', product: prods.get(String(m.productId))?.name ?? '',
      type: m.type, qty: m.qty, refType: m.refType ?? '', note: m.note ?? '' }));
    const byType: Record<string, number> = {}; rows.forEach(x => { byType[x.type] = (byType[x.type] ?? 0) + x.qty; });
    return { title: 'Stock movement', period: { from: r.fromStr, to: r.toStr },
      columns: [
        { key: 'date', label: 'Date', type: 'date' }, { key: 'branch', label: 'Branch', type: 'text' }, { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'product', label: 'Product', type: 'text' }, { key: 'type', label: 'Type', type: 'text' }, { key: 'qty', label: 'Qty', type: 'int' },
        { key: 'refType', label: 'Source', type: 'text' }, { key: 'note', label: 'Note', type: 'text' }],
      rows, totals: sumOf(rows, ['qty']), meta: { netQtyByType: byType } };
  }

  // ---------- 7. customer ledger (every kind of transaction, kept distinguishable) ----------
  async customerLedger(q: ReportQueryDto, user: AuthUser): Promise<Report> {
    if (!q.customerId) throw new BadRequestException('customerId is required');
    const r = this.range(q), cid = oid(q.customerId), at = { $gte: r.from, $lt: r.to };
    const names = await this.branchNames();
    const bm = this.branchMatch(user, q.branchId);
    const customer = await this.customers.findById(cid).select('name mobile').lean();
    if (!customer) throw new BadRequestException('Customer not found');
    const inv: any[] = await this.invoices.find({ customerId: cid, status: 'FINAL', finalizedAt: at, ...(bm && { branchId: bm }) })
      .select('number type taxMode branchId finalizedAt totals.finalPayable').lean();
    const invIds = inv.map(i => i._id);
    const cl: any[] = await this.custLedger.find({ customerId: cid, at, ...(bm && { $or: [{ branchId: bm }, { invoiceId: { $in: invIds } }] }) }).lean();
    const dp: any[] = await this.dairyPayments.find({ customerId: cid, at, ...(bm && { branchId: bm }) }).lean();
    const schemes: any[] = await this.dairySchemes.find({ customerId: cid, ...(bm && { branchId: bm }) }).select('schemeNo').lean();
    const dl: any[] = await this.dairyLedger.find({ schemeId: { $in: schemes.map(s => s._id) }, at, kind: { $in: ['BONUS', 'INVOICE', 'MANUAL'] } }).lean();
    const ex: any[] = await this.exchanges.find({ customerId: cid, at, ...(bm && { branchId: bm }) }).lean();
    const sno = new Map(schemes.map(s => [String(s._id), s.schemeNo]));
    const rows: any[] = [
      ...inv.map(i => ({ date: i.finalizedAt, kind: i.type === 'SALE' ? 'PURCHASE' : 'RETURN', ref: i.number, account: 'PURCHASES', amountPaise: i.totals.finalPayable,
        note: `${names.get(String(i.branchId)) ?? ''} · ${i.taxMode === 'NON_GST' ? 'bill of supply' : 'GST invoice'}` })),
      ...cl.map(l => ({ date: l.at, kind: l.kind, ref: l.receiptNo ?? l.invoiceNumber ?? '', account: l.account, amountPaise: l.delta, note: l.note ?? l.mode ?? '' })),
      ...dp.map(p => ({ date: p.at, kind: 'DAIRY_DEPOSIT', ref: p.receiptNo, account: 'DAIRY', amountPaise: p.amountPaise, note: `${sno.get(String(p.schemeId)) ?? ''} · ${p.mode}` })),
      ...dl.map(l => ({ date: l.at, kind: l.kind === 'BONUS' ? 'DAIRY_BONUS' : l.kind === 'INVOICE' ? 'DAIRY_USED' : 'DAIRY_ADJUST', ref: l.invoiceNumber ?? sno.get(String(l.schemeId)) ?? '',
        account: 'DAIRY', amountPaise: l.direction === 'CREDIT' ? l.amountPaise : -l.amountPaise, note: l.note ?? '' })),
      ...ex.map(e => ({ date: e.at, kind: 'OLD_METAL', ref: e.invoiceNumber ?? '', account: 'EXCHANGE', amountPaise: (e.totals?.goldValuePaise ?? 0) + (e.totals?.silverValuePaise ?? 0),
        fineGoldMg: e.totals?.goldFineMg ?? 0, fineSilverMg: e.totals?.silverFineMg ?? 0, note: '' })),
    ].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    this.guard(rows);
    const purchasesPaise = rows.filter(x => x.kind === 'PURCHASE').reduce((s, x) => s + x.amountPaise, 0);
    const returnsPaise = -rows.filter(x => x.kind === 'RETURN').reduce((s, x) => s + x.amountPaise, 0);
    return { title: `Customer ledger — ${customer.name} (${customer.mobile})`, period: { from: r.fromStr, to: r.toStr },
      columns: [
        { key: 'date', label: 'Date', type: 'date' }, { key: 'kind', label: 'Entry', type: 'text' }, { key: 'ref', label: 'Reference', type: 'text' },
        { key: 'account', label: 'Account', type: 'text' }, { key: 'amountPaise', label: 'Amount', type: 'money' },
        { key: 'fineGoldMg', label: 'Fine gold g', type: 'weight' }, { key: 'fineSilverMg', label: 'Fine silver g', type: 'weight' }, { key: 'note', label: 'Note', type: 'text' }],
      rows, meta: { purchasesPaise, returnsPaise, netPurchasesPaise: purchasesPaise - returnsPaise,
        dairyDepositsPaise: rows.filter(x => x.kind === 'DAIRY_DEPOSIT').reduce((s, x) => s + x.amountPaise, 0) } };
  }

  // ---------- 8. supplier ledger (cash and fine metal accounts) ----------
  async supplierLedger(q: ReportQueryDto, user: AuthUser): Promise<Report> {
    if (!q.supplierId) throw new BadRequestException('supplierId is required');
    const r = this.range(q), names = await this.branchNames();
    const sup = await this.supModel.findById(oid(q.supplierId)).select('name').lean();
    if (!sup) throw new BadRequestException('Supplier not found');
    const f: any = { supplierId: oid(q.supplierId), at: { $gte: r.from, $lt: r.to } };
    if (q.account) f.account = q.account;
    if (user.role !== 'ADMIN') f.branchId = { $in: user.branchIds.map(oid) };       // owners see their branches' entries only
    else if (q.branchId) f.branchId = oid(q.branchId);
    const lines: any[] = this.guard(await this.supLedger.find(f).sort({ at: 1, _id: 1 }).limit(MAX_ROWS + 1).lean());
    const rows = lines.map(l => ({ date: l.at, account: l.account ?? 'CASH', kind: l.kind, ref: l.voucherNo ?? l.purchaseNo ?? l.billNo ?? '',
      branch: l.branchId ? names.get(String(l.branchId)) ?? '' : '', cashDeltaPaise: (l.account ?? 'CASH') === 'CASH' ? l.delta : null,
      metalDeltaMg: (l.account ?? 'CASH') !== 'CASH' ? l.delta : null, cashValuePaise: l.cashPaise ?? null, rateGramPaise: l.rateGramPaise ?? null,
      balanceAfterPaise: (l.account ?? 'CASH') === 'CASH' ? l.balanceAfter : null, balanceAfterMg: (l.account ?? 'CASH') !== 'CASH' ? l.balanceAfter : null, note: l.note ?? '' }));
    const net: Record<string, number> = { CASH: 0, GOLD: 0, SILVER: 0 }; rows.forEach(x => { net[x.account] += x.cashDeltaPaise ?? x.metalDeltaMg ?? 0; });
    return { title: `Supplier ledger — ${sup.name}`, period: { from: r.fromStr, to: r.toStr },
      columns: [
        { key: 'date', label: 'Date', type: 'date' }, { key: 'account', label: 'Account', type: 'text' }, { key: 'kind', label: 'Entry', type: 'text' },
        { key: 'ref', label: 'Reference', type: 'text' }, { key: 'branch', label: 'Branch', type: 'text' }, { key: 'cashDeltaPaise', label: 'Cash +owed/−paid', type: 'money' },
        { key: 'metalDeltaMg', label: 'Fine g +owed/−paid', type: 'weight' }, { key: 'cashValuePaise', label: 'Cash value', type: 'money' },
        { key: 'rateGramPaise', label: 'Rate /g', type: 'money' }, { key: 'balanceAfterPaise', label: 'Cash balance', type: 'money' },
        { key: 'balanceAfterMg', label: 'Fine balance g', type: 'weight' }, { key: 'note', label: 'Note', type: 'text' }],
      rows, meta: { netChange: { cashPaise: net.CASH, goldFineMg: net.GOLD, silverFineMg: net.SILVER } } };
  }
}
