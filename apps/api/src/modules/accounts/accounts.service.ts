import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuthUser } from '@ajay/shared';
import { CASH_LIMIT_PAISE } from '../../common/constants';
import { financialYearCode } from '../../engines/numbering';
import { BranchesService } from '../branches/branches.service';
import { Counter } from '../catalog/counter.schema';
import { CustomersService } from '../customers/customers.service';
import { DairyService } from '../dairy/dairy.service';
import { Exchange } from '../exchange/exchange.schema';
import { Invoice } from '../pos/invoice.schema';
import { CustomerAccount, CustomerLedger, LedgerKind } from './account.schema';
import { AccountAdjustDto, AdvanceDto, AdvanceRefundDto, DuePaymentDto, StatementQueryDto } from './dto/accounts.dto';

const oid = (s: any) => new Types.ObjectId(String(s));
const CASH_MSG = 'Cash receipts of ₹2,00,000 or more from one customer in a day are not permitted (Sec 269ST).';

@Injectable()
export class AccountsService {
  constructor(
    @InjectModel(CustomerAccount.name) private accounts: Model<CustomerAccount>,
    @InjectModel(CustomerLedger.name) private ledger: Model<CustomerLedger>,
    @InjectModel(Invoice.name) private invoices: Model<Invoice>,
    @InjectModel(Exchange.name) private exchanges: Model<Exchange>,
    @InjectModel(Counter.name) private counters: Model<any>,
    @InjectConnection() private conn: Connection,
    private branches: BranchesService, private customers: CustomersService, private dairy: DairyService,
  ) {}

  private async nextNo(branchId: string, kind: 'AR' | 'PR', session?: ClientSession) {
    const branch = await this.branches.findOne(branchId);
    const fy = financialYearCode();
    const c = await this.counters.findOneAndUpdate({ _id: `${kind}:${branchId}:${fy}` }, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    return `${branch.invoicePrefix}-${kind}-${fy}-${String(c.seq).padStart(6, '0')}`;
  }

  /** THE ONLY place ADVANCE/DUE balances change: guarded atomic update + immutable statement line. */
  private async move(customerId: string, account: 'ADVANCE' | 'DUE', delta: number,
    entry: { kind: LedgerKind } & Partial<CustomerLedger>, session?: ClientSession) {
    const field = account === 'ADVANCE' ? 'advancePaise' : 'duePaise';
    const filter: Record<string, unknown> = { customerId: oid(customerId) };
    if (delta < 0) filter[field] = { $gte: -delta };
    let doc: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { doc = await this.accounts.findOneAndUpdate(filter, { $inc: { [field]: delta } }, { new: true, upsert: delta > 0, session }); break; }
      catch (e: any) { if (e.code !== 11000 || attempt === 1) throw e; }
    }
    if (!doc) throw new BadRequestException(account === 'ADVANCE'
      ? 'Amount exceeds the available advance balance' : 'Amount exceeds the outstanding due');
    await this.ledger.create([{ customerId: oid(customerId), account, delta, balanceAfter: doc[field], ...entry }], { session });
    return doc;
  }

  // ---------- advance ----------
  async receiveAdvance(customerId: string, dto: AdvanceDto, user: AuthUser) {
    await this.customers.findOne(customerId);
    await this.branches.assertAllExist([dto.branchId]);
    return this.conn.transaction(async session => {
      if (dto.mode === 'CASH' && (await this.dairy.cashToday(customerId, session)) + dto.amountPaise >= CASH_LIMIT_PAISE)
        throw new BadRequestException(CASH_MSG);
      const receiptNo = await this.nextNo(dto.branchId, 'AR', session);
      const a = await this.move(customerId, 'ADVANCE', dto.amountPaise, { kind: 'ADVANCE_RECEIPT', mode: dto.mode, ref: dto.ref,
        receiptNo, branchId: oid(dto.branchId), note: dto.note, createdBy: oid(user.id) }, session);
      return { receiptNo, advancePaise: a.advancePaise, duePaise: a.duePaise };
    });
  }

  async refundAdvance(customerId: string, dto: AdvanceRefundDto, user: AuthUser) {
    await this.customers.findOne(customerId);
    return this.conn.transaction(async session => {
      const a = await this.move(customerId, 'ADVANCE', -dto.amountPaise, { kind: 'ADVANCE_REFUND', mode: dto.mode,
        note: dto.reason, createdBy: oid(user.id) }, session);
      return { advancePaise: a.advancePaise };
    });
  }

  /** Draft-time check (no writes). */
  async checkAdvance(customerId: string | undefined, amount: number, payable: number, session?: ClientSession) {
    if (!amount) return;
    if (!customerId) throw new BadRequestException('Select the customer before applying an advance');
    const a = await this.accounts.findOne({ customerId: oid(customerId) }).session(session ?? null);
    if ((a?.advancePaise ?? 0) < amount) throw new BadRequestException("Advance adjustment exceeds the customer's advance balance");
    if (amount > payable) throw new BadRequestException('Advance adjustment exceeds the net payable');
  }

  /** Inside the finalize transaction. */
  useAdvance(customerId: string, amount: number, ref: { invoiceId: string; invoiceNumber: string; userId: string }, session: ClientSession) {
    return this.move(customerId, 'ADVANCE', -amount, { kind: 'ADVANCE_USED', invoiceId: oid(ref.invoiceId),
      invoiceNumber: ref.invoiceNumber, createdBy: oid(ref.userId) }, session);
  }

  // ---------- due (credit sales) ----------
  addDue(customerId: string, amount: number, ref: { invoiceId: string; invoiceNumber: string; userId: string }, session: ClientSession) {
    return this.move(customerId, 'DUE', amount, { kind: 'DUE_CREATED', invoiceId: oid(ref.invoiceId),
      invoiceNumber: ref.invoiceNumber, createdBy: oid(ref.userId) }, session);
  }

  async collectDue(customerId: string, dto: DuePaymentDto, user: AuthUser) {
    await this.customers.findOne(customerId);
    await this.branches.assertAllExist([dto.branchId]);
    return this.conn.transaction(async session => {
      if (dto.mode === 'CASH' && (await this.dairy.cashToday(customerId, session)) + dto.amountPaise >= CASH_LIMIT_PAISE)
        throw new BadRequestException(CASH_MSG);
      const receiptNo = await this.nextNo(dto.branchId, 'PR', session);
      const a = await this.move(customerId, 'DUE', -dto.amountPaise, { kind: 'DUE_PAYMENT', mode: dto.mode, ref: dto.ref,
        receiptNo, branchId: oid(dto.branchId), createdBy: oid(user.id) }, session);
      return { receiptNo, duePaise: a.duePaise };
    });
  }

  // ---------- admin ----------
  async adjust(customerId: string, dto: AccountAdjustDto, user: AuthUser) {
    await this.customers.findOne(customerId);
    return this.conn.transaction(async session => {
      const a = await this.move(customerId, dto.account, dto.type === 'INCREASE' ? dto.amountPaise : -dto.amountPaise,
        { kind: 'MANUAL', note: dto.reason, createdBy: oid(user.id) }, session);
      return { advancePaise: a.advancePaise, duePaise: a.duePaise };
    });
  }

  /** Customer-safe receipt data for an advance receipt or a due payment. */
  async receipt(customerId: string, no: string, user: AuthUser) {
    const e = await this.ledger.findOne({ customerId: oid(customerId), receiptNo: no }).lean();
    if (!e || (user.role !== 'ADMIN' && e.branchId && !user.branchIds.includes(String(e.branchId)))) throw new NotFoundException('Receipt not found');
    const [customer, branch] = await Promise.all([this.customers.findOne(customerId), this.branches.findOne(String(e.branchId))]);
    return { receiptNo: no, kind: e.kind, date: e.at, mode: e.mode, ref: e.ref, amountPaise: Math.abs(e.delta), balanceAfter: e.balanceAfter,
      branch: { name: branch.name, address: branch.address, gstin: branch.gstin, receiptPaper: branch.receiptPaper ?? 'A5' }, customer: { name: customer.name, mobile: customer.mobile } };
  }

  // ---------- views ----------
  /** One screen for the customer: each account kept separate. Old-metal totals are internal (owner/admin only). */
  async summary(customerId: string, user: AuthUser) {
    const customer = await this.customers.findOne(customerId);
    const cid = oid(customerId);
    const [acct, schemes, groups] = await Promise.all([
      this.accounts.findOne({ customerId: cid }).lean(),
      this.dairy.balancesForCustomer(customerId),
      this.invoices.aggregate([{ $match: { customerId: cid, status: 'FINAL' } },
        { $group: { _id: '$type', n: { $sum: 1 }, total: { $sum: '$totals.finalPayable' } } }]),
    ]);
    const sale = groups.find(g => g._id === 'SALE'), cn = groups.find(g => g._id === 'CREDIT_NOTE');
    const out: Record<string, unknown> = {
      customer: { _id: customer._id, name: customer.name, mobile: customer.mobile },
      advance: { balancePaise: acct?.advancePaise ?? 0 },
      due: { balancePaise: acct?.duePaise ?? 0 },
      dairy: { balancePaise: schemes.reduce((s, x) => s + x.balancePaise, 0), schemes },
      purchases: { invoiceCount: sale?.n ?? 0, totalPaise: (sale?.total ?? 0) + (cn?.total ?? 0), returnsPaise: Math.abs(cn?.total ?? 0) },
    };
    if (user.role !== 'STAFF') {
      const [ex] = await this.exchanges.aggregate([{ $match: { customerId: cid } }, { $group: { _id: null,
        g: { $sum: '$totals.goldFineMg' }, s: { $sum: '$totals.silverFineMg' },
        v: { $sum: { $add: ['$totals.goldValuePaise', '$totals.silverValuePaise'] } } } }]);
      out.exchange = { goldFineMg: ex?.g ?? 0, silverFineMg: ex?.s ?? 0, valuePaise: ex?.v ?? 0 };
    }
    return out;
  }

  async statement(customerId: string, q: StatementQueryDto, user: AuthUser) {
    await this.customers.findOne(customerId);
    const cid = oid(customerId), skip = (q.page - 1) * q.limit;
    if (q.account === 'DAIRY') return this.dairy.statementForCustomer(customerId, q.page, q.limit);
    if (q.account === 'ADVANCE' || q.account === 'DUE') {
      const f = { customerId: cid, account: q.account };
      const [items, total] = await Promise.all([
        this.ledger.find(f).sort({ at: -1, _id: -1 }).skip(skip).limit(q.limit).lean(), this.ledger.countDocuments(f)]);
      return { items, total, page: q.page, limit: q.limit };
    }
    if (q.account === 'PURCHASES') {
      const f = { customerId: cid, status: 'FINAL' };
      const [items, total] = await Promise.all([
        this.invoices.find(f).select('number type branchId finalizedAt totals.finalPayable advancePaise duePaise payments')
          .sort({ finalizedAt: -1 }).skip(skip).limit(q.limit).lean(), this.invoices.countDocuments(f)]);
      return { items, total, page: q.page, limit: q.limit };
    }
    if (user.role === 'STAFF') throw new ForbiddenException('Old-metal records are for the owner or admin');
    const [items, total] = await Promise.all([
      this.exchanges.find({ customerId: cid }).sort({ at: -1 }).skip(skip).limit(q.limit).lean(), this.exchanges.countDocuments({ customerId: cid })]);
    return { items, total, page: q.page, limit: q.limit };
  }
}
