import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuthUser } from '@ajay/shared';
import { CASH_LIMIT_PAISE } from '../../common/constants';
import { escapeRegex } from '../../common/dto/page-query.dto';
import { formatINR } from '../../common/utils/money';
import { isoDate, istDayStart } from '../../common/utils/time';
import { dairyStatusFromPaid } from '../../engines/dairy.engine';
import { financialYearCode } from '../../engines/numbering';
import { BranchesService } from '../branches/branches.service';
import { Counter } from '../catalog/counter.schema';
import { CustomersService } from '../customers/customers.service';
import { CustomerLedger } from '../accounts/account.schema';
import { Invoice } from '../pos/invoice.schema';
import { CollectDto, CreateSchemeDto, DairyQueryDto, DairyUseDto, ManualAdjustDto } from './dto/dairy.dto';
import { DairyLedger, DairyPayment, DairyScheme } from './dairy.schema';

const oid = (s: any) => new Types.ObjectId(String(s));

@Injectable()
export class DairyService {
  constructor(
    @InjectModel(DairyScheme.name) private schemes: Model<DairyScheme>,
    @InjectModel(DairyPayment.name) private payments: Model<DairyPayment>,
    @InjectModel(DairyLedger.name) private ledger: Model<DairyLedger>,
    @InjectModel(Counter.name) private counters: Model<any>,
    @InjectModel(Invoice.name) private invoices: Model<Invoice>,
    @InjectModel(CustomerLedger.name) private custLedger: Model<CustomerLedger>,
    @InjectConnection() private conn: Connection,
    private branches: BranchesService, private customers: CustomersService,
  ) {}

  // ---------- helpers ----------
  private status(s: DairyScheme) {
    return dairyStatusFromPaid({ start: s.startDate, monthly: s.monthlyPaise, durationMonths: s.durationMonths as 6 | 11 | 12,
      type: s.schemeType, bonusInstallments: s.bonusInstallments }, s.paidPaise);
  }
  private view(s: any) {
    const st = this.status(s);
    const state = st.status !== 'ACTIVE' && s.balancePaise === 0 && s.paidPaise > 0 ? 'REDEEMED' : st.status;
    return { ...(s.toJSON ? s.toJSON() : s), status: state, paidMonths: st.paidMonths, missedMonths: st.missed,
      maturityDate: st.maturityDate, canRedeem: s.balancePaise > 0, bonusForfeited: !!s.bonusForfeitedAt };
  }
  /** Bonus is cancelled once the balance is used before the scheme is complete. */
  private forfeitsBonus(s: DairyScheme) {
    return s.schemeType === 'BONUS' && !s.bonusCreditedAt && !s.bonusForfeitedAt && this.status(s).status !== 'COMPLETED';
  }
  private assertBranch(user: AuthUser, branchId: any) {
    if (user.role !== 'ADMIN' && !user.branchIds.includes(String(branchId))) throw new NotFoundException('Scheme not found');
  }
  private async load(id: string, user: AuthUser, session?: ClientSession) {
    const s = await this.schemes.findById(id).session(session ?? null);
    if (!s) throw new NotFoundException('Scheme not found');
    this.assertBranch(user, s.branchId);
    return s;
  }
  private async nextNo(branchId: any, kind: 'DY' | 'DR', session?: ClientSession) {
    const branch = await this.branches.findOne(String(branchId));
    const fy = financialYearCode();
    const c = await this.counters.findOneAndUpdate({ _id: `${kind}:${branchId}:${fy}` }, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    return `${branch.invoicePrefix}-${kind}-${fy}-${String(c.seq).padStart(6, '0')}`;
  }

  /** Cash taken from this customer today (IST): bills + dairy deposits — for the Sec 269ST limit. */
  async cashToday(customerId: any, session?: ClientSession): Promise<number> {
    const from = istDayStart(), cid = oid(customerId);
    const [inv] = await this.invoices.aggregate([
      { $match: { customerId: cid, status: 'FINAL', type: 'SALE', finalizedAt: { $gte: from } } },
      { $unwind: '$payments' }, { $match: { 'payments.mode': 'CASH' } },
      { $group: { _id: null, t: { $sum: '$payments.amountPaise' } } },
    ]).session(session ?? null);
    const [dp] = await this.payments.aggregate([
      { $match: { customerId: cid, mode: 'CASH', at: { $gte: from } } },
      { $group: { _id: null, t: { $sum: '$amountPaise' } } },
    ]).session(session ?? null);
    const [cl] = await this.custLedger.aggregate([
      { $match: { customerId: cid, mode: 'CASH', kind: { $in: ['ADVANCE_RECEIPT', 'DUE_PAYMENT'] }, at: { $gte: from } } },
      { $group: { _id: null, t: { $sum: { $abs: '$delta' } } } },
    ]).session(session ?? null);
    return (inv?.t ?? 0) + (dp?.t ?? 0) + (cl?.t ?? 0);
  }

  // ---------- setup ----------
  async createScheme(dto: CreateSchemeDto, user: AuthUser) {
    if (dto.monthlyPaise % 100 !== 0) throw new BadRequestException('Monthly amount must be in whole rupees');
    if (user.role !== 'ADMIN' && !user.branchIds.includes(dto.branchId)) throw new NotFoundException('Branch not found');
    await this.branches.assertAllExist([dto.branchId]);
    await this.customers.findOne(dto.customerId);
    const schemeNo = await this.nextNo(dto.branchId, 'DY');
    const s = await this.schemes.create({
      schemeNo, customerId: oid(dto.customerId), branchId: oid(dto.branchId), startDate: dto.startDate,
      monthlyPaise: dto.monthlyPaise, durationMonths: dto.durationMonths, schemeType: dto.type,
      bonusInstallments: dto.type === 'BONUS' ? dto.bonusInstallments ?? 1 : 0, createdBy: oid(user.id),
    });
    return this.view(s);
  }

  async list(q: DairyQueryDto, user: AuthUser) {
    const f: Record<string, any> = {};
    if (q.branchId) f.branchId = oid(q.branchId);
    else if (user.role !== 'ADMIN') f.branchId = { $in: user.branchIds.map(oid) };
    if (q.customerId) f.customerId = oid(q.customerId);
    if (q.q) f.schemeNo = new RegExp(escapeRegex(q.q), 'i');
    const [items, total] = await Promise.all([
      this.schemes.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit), this.schemes.countDocuments(f)]);
    const who = await this.customers.names(items.map(s => s.customerId));
    return { items: items.map(s => ({ ...this.view(s), customer: who.get(String(s.customerId)) ?? null })), total, page: q.page, limit: q.limit };
  }

  async get(id: string, user: AuthUser) {
    const s = await this.load(id, user);
    const [payments, ledger] = await Promise.all([
      this.payments.find({ schemeId: s._id }).sort({ at: -1 }).limit(50).lean(),
      this.ledger.find({ schemeId: s._id }).sort({ at: -1, _id: -1 }).limit(100).lean(),
    ]);
    const customer = (await this.customers.names([s.customerId])).get(String(s.customerId)) ?? null;
    return { ...this.view(s), customer, payments, ledger };
  }

  // ---------- monthly collection ----------
  /** Atomic: guard against over-collection → receipt number → payment → ledger (→ bonus on completion). */
  collect(id: string, dto: CollectDto, user: AuthUser) {
    return this.conn.transaction(async session => {
      const s = await this.load(id, user, session);
      if (dto.amountPaise % s.monthlyPaise !== 0)
        throw new BadRequestException(`Amount must be a whole number of installments of ${formatINR(s.monthlyPaise)}`);
      const months = dto.amountPaise / s.monthlyPaise, target = s.monthlyPaise * s.durationMonths;
      if (dto.mode === 'CASH' && (await this.cashToday(s.customerId, session)) + dto.amountPaise >= CASH_LIMIT_PAISE)
        throw new BadRequestException('Cash receipts of ₹2,00,000 or more from one customer in a day are not permitted (Sec 269ST).');

      const upd = await this.schemes.findOneAndUpdate({ _id: s._id, paidPaise: { $lte: target - dto.amountPaise } },
        { $inc: { paidPaise: dto.amountPaise, balancePaise: dto.amountPaise } }, { new: true, session });
      if (!upd) throw new BadRequestException('Payment exceeds the remaining installments of this scheme');

      const receiptNo = await this.nextNo(s.branchId, 'DR', session);
      const paidMonthsAfter = Math.floor(upd.paidPaise / s.monthlyPaise);
      const [pay] = await this.payments.create([{
        schemeId: s._id, customerId: s.customerId, branchId: s.branchId, amountPaise: dto.amountPaise, mode: dto.mode,
        ref: dto.ref, monthsCovered: months, receiptNo, paidMonthsAfter, paidPaiseAfter: upd.paidPaise, collectedBy: oid(user.id),
      }], { session });
      await this.ledger.create([{ schemeId: s._id, direction: 'CREDIT', kind: 'PAYMENT', amountPaise: dto.amountPaise,
        paymentId: pay._id, balanceAfter: upd.balancePaise, createdBy: oid(user.id) }], { session });

      let latest = upd;
      if (upd.paidPaise >= target && upd.schemeType === 'BONUS' && !upd.bonusCreditedAt && !upd.bonusForfeitedAt) {
        const bonus = (upd.bonusInstallments || 1) * s.monthlyPaise;
        const b = await this.schemes.findOneAndUpdate({ _id: s._id, bonusCreditedAt: { $exists: false } },
          { $set: { bonusCreditedAt: new Date() }, $inc: { balancePaise: bonus } }, { new: true, session });
        if (b) {
          latest = b;
          await this.ledger.create([{ schemeId: s._id, direction: 'CREDIT', kind: 'BONUS', amountPaise: bonus,
            balanceAfter: b.balancePaise, note: 'Scheme completion bonus', createdBy: oid(user.id) }], { session });
        }
      }
      return { receiptNo, payment: pay, scheme: this.view(latest) };
    });
  }

  /** Customer-safe receipt: amounts and instalment counts only. */
  async receipt(no: string, user: AuthUser) {
    const p = await this.payments.findOne({ receiptNo: no }).lean();
    if (!p) throw new NotFoundException('Receipt not found');
    this.assertBranch(user, p.branchId);
    const [s, customer, branch] = await Promise.all([
      this.schemes.findById(p.schemeId).lean(), this.customers.findOne(String(p.customerId)), this.branches.findOne(String(p.branchId))]);
    return {
      receiptNo: p.receiptNo, date: p.at, branch: { name: branch.name, address: branch.address, gstin: branch.gstin, receiptPaper: branch.receiptPaper ?? 'A5' },
      customer: { name: customer.name, mobile: customer.mobile }, schemeNo: s?.schemeNo, mode: p.mode,
      amountPaise: p.amountPaise, monthsCovered: p.monthsCovered, installmentsPaid: p.paidMonthsAfter,
      totalInstallments: s?.durationMonths, totalDepositedPaise: p.paidPaiseAfter,
    };
  }

  // ---------- POS integration ----------
  /** Schemes a customer has (any branch) with what can be used on a bill today. */
  async balancesForCustomer(customerId: string) {
    const list = await this.schemes.find({ customerId: oid(customerId) }).sort({ createdAt: 1 });
    return list.map(s => {
      const v = this.view(s);
      return { schemeId: s._id, schemeNo: s.schemeNo, branchId: s.branchId, status: v.status, balancePaise: s.balancePaise,
        maturityDate: v.maturityDate, canRedeem: v.canRedeem, forfeitsBonusIfUsed: this.forfeitsBonus(s) };
    });
  }

  /** Draft-time validation (no writes). Returns the totals the pricing engine needs. */
  async checkUse(inputs: DairyUseDto[], customerId: string | undefined, session?: ClientSession) {
    if (!inputs.length) return { total: 0, available: 0 };
    if (!customerId) throw new BadRequestException('Select the customer before applying a dairy adjustment');
    const ids = inputs.map(i => i.schemeId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each dairy scheme can be used once per bill');
    let total = 0, available = 0;
    for (const i of inputs) {
      const s = await this.schemes.findById(i.schemeId).session(session ?? null);
      if (!s || String(s.customerId) !== customerId) throw new BadRequestException('Dairy scheme not found for this customer');
      // Usable any time during the tenure; using it early cancels the bonus, so the cashier must confirm.
      if (this.forfeitsBonus(s) && !i.confirmForfeitBonus)
        throw new BadRequestException({ code: 'BONUS_FORFEIT',
          message: `Using scheme ${s.schemeNo} before it is complete cancels its bonus. Confirm to continue.` });
      if (i.amountPaise > s.balancePaise) throw new BadRequestException(`Dairy adjustment exceeds the balance of scheme ${s.schemeNo}`);
      total += i.amountPaise; available += s.balancePaise;
    }
    return { total, available };
  }

  /** Called inside the invoice-finalize transaction: atomic, guarded debit + ledger entry linked to the invoice. */
  async redeem(i: { schemeId: string; amountPaise: number; customerId: string; invoiceId: string; invoiceNumber: string; actorId: string },
    session: ClientSession) {
    const s = await this.schemes.findById(i.schemeId).session(session);
    if (!s || String(s.customerId) !== i.customerId) throw new BadRequestException('Dairy scheme not found for this customer');
    const forfeit = this.forfeitsBonus(s);
    const upd = await this.schemes.findOneAndUpdate({ _id: s._id, balancePaise: { $gte: i.amountPaise } },
      { $inc: { balancePaise: -i.amountPaise } }, { new: true, session });
    if (!upd) throw new BadRequestException(`Dairy adjustment exceeds the balance of scheme ${s.schemeNo}`);
    if (forfeit) await this.schemes.updateOne({ _id: s._id, bonusForfeitedAt: { $exists: false } }, { $set: { bonusForfeitedAt: new Date() } }, { session });
    const [e] = await this.ledger.create([{ schemeId: s._id, direction: 'DEBIT', kind: 'INVOICE', amountPaise: i.amountPaise,
      invoiceId: oid(i.invoiceId), invoiceNumber: i.invoiceNumber, balanceAfter: upd.balancePaise,
      note: forfeit ? 'Used before completion — bonus cancelled' : undefined, createdBy: oid(i.actorId) }], { session });
    return e._id as Types.ObjectId;
  }

  /** Dairy statement across all of a customer's schemes (newest first). */
  async statementForCustomer(customerId: string, page: number, limit: number) {
    const sch = await this.schemes.find({ customerId: oid(customerId) }).select('_id schemeNo').lean();
    const f = { schemeId: { $in: sch.map(x => x._id) } };
    const [items, total] = await Promise.all([
      this.ledger.find(f).sort({ at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), this.ledger.countDocuments(f)]);
    const no = new Map(sch.map(x => [String(x._id), x.schemeNo]));
    return { items: items.map(e => ({ ...e, schemeNo: no.get(String(e.schemeId)) })), total, page, limit };
  }

  // ---------- admin correction ----------
  manualAdjust(dto: ManualAdjustDto, user: AuthUser) {
    return this.conn.transaction(async session => {
      const s = await this.schemes.findById(dto.schemeId).session(session);
      if (!s) throw new NotFoundException('Scheme not found');
      const credit = dto.type === 'CREDIT';
      const upd = await this.schemes.findOneAndUpdate(
        credit ? { _id: s._id } : { _id: s._id, balancePaise: { $gte: dto.amountPaise } },
        { $inc: { balancePaise: credit ? dto.amountPaise : -dto.amountPaise } }, { new: true, session });
      if (!upd) throw new BadRequestException('Adjustment exceeds the scheme balance');
      const [e] = await this.ledger.create([{ schemeId: s._id, direction: dto.type, kind: 'MANUAL', amountPaise: dto.amountPaise,
        balanceAfter: upd.balancePaise, note: dto.reason, createdBy: oid(user.id) }], { session });
      return { scheme: this.view(upd), ledgerId: e._id };
    });
  }
}
