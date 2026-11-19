import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuthUser } from '@ajay/shared';
import { escapeRegex } from '../../common/dto/page-query.dto';
import { BranchesService } from '../branches/branches.service';
import { RawInventoryService } from '../exchange/raw-inventory.service';
import { NumberingService } from '../numbering/numbering.service';
import { RatesService } from '../rates/rates.service';
import {
  ConvertDto, CreateSupplierDto, MetalPaymentDto, SupplierAdjustDto, SupplierPaymentDto, SupplierStatementQueryDto, UpdateSupplierDto,
} from './dto/supplier.dto';
import { Purchase, Supplier, SupplierKind, SupplierLedger } from './supplier.schema';

type Metal = 'GOLD' | 'SILVER';
type Changes = { cash?: number; gold?: number; silver?: number };
const oid = (s: any) => new Types.ObjectId(String(s));
const FIELD = { cash: 'balancePaise', gold: 'goldFineMg', silver: 'silverFineMg' } as const;
const ACCOUNT = { cash: 'CASH', gold: 'GOLD', silver: 'SILVER' } as const;
const metalKey = (m: Metal) => (m === 'GOLD' ? 'gold' : 'silver') as 'gold' | 'silver';
const rateKey = (m: Metal) => (m === 'GOLD' ? 'GOLD_24K' : 'SILVER');
const balances = (s: any) => ({ balancePaise: s.balancePaise, goldFineMg: s.goldFineMg, silverFineMg: s.silverFineMg });

/** Fine weight (mg) = net weight × purity %   (24K = 100%, 22K = 91.6%, 18K = 75%). */
export const fineOf = (netMg: number, purityPct: number) => Math.round((netMg * purityPct) / 100);

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Supplier.name) private model: Model<Supplier>,
    @InjectModel(SupplierLedger.name) private ledger: Model<SupplierLedger>,
    @InjectModel(Purchase.name) private purchases: Model<Purchase>,
    @InjectConnection() private conn: Connection,
    private numbering: NumberingService, private branches: BranchesService,
    private rates: RatesService, private raw: RawInventoryService,
  ) {}

  async create(dto: CreateSupplierDto, actorId: string) {
    try { return await this.model.create({ ...dto, createdBy: oid(actorId) }); }
    catch (e: any) { if (e.code === 11000) throw new ConflictException('Mobile already registered to a supplier'); throw e; }
  }
  async list(page: number, limit: number, q?: string) {
    const f = q ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { mobile: new RegExp(escapeRegex(q)) }] } : {};
    const [items, total] = await Promise.all([
      this.model.find(f).sort({ name: 1 }).skip((page - 1) * limit).limit(limit), this.model.countDocuments(f)]);
    return { items, total, page, limit };
  }
  /** id → name, to label purchase lists. */
  async names(ids: any[]) {
    const u = [...new Set(ids.filter(Boolean).map(String))];
    if (!u.length) return new Map<string, string>();
    const rows = await this.model.find({ _id: { $in: u.map(oid) } }).select('name').lean();
    return new Map(rows.map(r => [String(r._id), r.name]));
  }
  async findOne(id: string) {
    const s = await this.model.findById(id);
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }
  async findActive(id: string) {
    const s = await this.findOne(id);
    if (!s.active) throw new BadRequestException('Supplier is inactive');
    return s;
  }
  async update(id: string, dto: UpdateSupplierDto) {
    try {
      const s = await this.model.findByIdAndUpdate(id, { $set: dto }, { new: true });
      if (!s) throw new NotFoundException('Supplier not found');
      return s;
    } catch (e: any) { if (e.code === 11000) throw new ConflictException('Mobile already registered to a supplier'); throw e; }
  }

  /** 24K gold / silver MARKET rate (paise per gram) used for every cash ↔ fine conversion. */
  async marketRate(metal: Metal, session?: ClientSession) {
    const r = (await this.rates.currentByKind('MARKET', session))[rateKey(metal)];
    if (!r) throw new BadRequestException(`${rateKey(metal).replace('_', ' ')} market rate not set`);
    return r.ratePerGramPaise;
  }

  /** Profile: the three balances kept separately, plus everything valued at today's market rates. */
  async profile(id: string) {
    const s = await this.findOne(id);
    const [agg] = await this.purchases.aggregate([{ $match: { supplierId: s._id, status: 'ACTIVE' } },
      { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$totalPaise' } } }]);
    const rates = await this.rates.currentByKind('MARKET');
    const g = rates['GOLD_24K']?.ratePerGramPaise, sv = rates['SILVER']?.ratePerGramPaise;
    const ok = (s.goldFineMg === 0 || g) && (s.silverFineMg === 0 || sv);
    const silverCash = sv ? (s.silverFineMg * sv) / 1000 : 0, goldCash = g ? (s.goldFineMg * g) / 1000 : 0;
    const valuedAtMarket = ok ? {
      totalCashPaise: Math.round(s.balancePaise + goldCash + silverCash),
      totalGoldFineMg: g ? Math.round(s.goldFineMg + (s.balancePaise * 1000) / g + (silverCash * 1000) / g) : null,
    } : null;
    return { ...s.toJSON(), balances: balances(s), valuedAtMarket, marketRates: { GOLD_24K: g ?? null, SILVER: sv ?? null },
      purchases: { count: agg?.n ?? 0, totalPaise: agg?.total ?? 0 } };
  }

  /**
   * THE ONLY place supplier balances change: one atomic update across the affected accounts + one immutable ledger line
   * per account moved. `min` makes a move conditional on enough balance (used by conversions).
   */
  async moveAccounts(supplierId: string, ch: Changes, entry: { kind: SupplierKind } & Partial<SupplierLedger>,
    session?: ClientSession, min: Changes = {}) {
    const inc: Record<string, number> = {}, filter: Record<string, any> = { _id: supplierId };
    for (const k of ['cash', 'gold', 'silver'] as const) {
      if (ch[k]) inc[FIELD[k]] = ch[k]!;
      if (min[k] !== undefined) filter[FIELD[k]] = { $gte: min[k] };
    }
    if (!Object.keys(inc).length) throw new BadRequestException('Nothing to record');
    const doc: any = await this.model.findOneAndUpdate(filter, { $inc: inc }, { new: true, session });
    if (!doc) {
      if (!(await this.model.exists({ _id: supplierId }).session(session ?? null))) throw new NotFoundException('Supplier not found');
      throw new BadRequestException('Not enough balance for this conversion');
    }
    const lines = (['cash', 'gold', 'silver'] as const).filter(k => ch[k])
      .map(k => ({ supplierId: doc._id, account: ACCOUNT[k], delta: ch[k]!, balanceAfter: doc[FIELD[k]], ...entry }));
    await this.ledger.create(lines as any[], { session });
    return doc;
  }
  /** Cash-only convenience. */
  move(supplierId: string, delta: number, entry: { kind: SupplierKind } & Partial<SupplierLedger>, session?: ClientSession) {
    return this.moveAccounts(supplierId, { cash: delta }, entry, session);
  }

  /** Cash payment. `settles` = CASH (default) pays money owed; GOLD / SILVER converts the cash to fine weight at the market rate and reduces the metal owed. */
  async pay(id: string, dto: SupplierPaymentDto, user: AuthUser) {
    await this.findActive(id);
    await this.branches.assertAllExist([dto.branchId]);
    const settles = dto.settles ?? 'CASH';
    return this.conn.transaction(async session => {
      const voucherNo = await this.numbering.next(dto.branchId, 'SP', session);
      const base = { kind: 'PAYMENT' as const, voucherNo, mode: dto.mode, ref: dto.ref, branchId: oid(dto.branchId), note: dto.note, createdBy: oid(user.id) };
      if (settles === 'CASH') return { voucherNo, ...balances(await this.moveAccounts(id, { cash: -dto.amountPaise }, base, session)) };
      const rate = await this.marketRate(settles, session);
      const fineMg = Math.round((dto.amountPaise * 1000) / rate);
      if (fineMg < 1) throw new BadRequestException('Amount is too small to convert into fine weight');
      const s = await this.moveAccounts(id, ({ [metalKey(settles)]: -fineMg } as Changes), { ...base, cashPaise: dto.amountPaise, rateGramPaise: rate }, session);
      return { voucherNo, fineMg, rateGramPaise: rate, ...balances(s) };
    });
  }

  /** Metal payment: fine = net × purity %, optionally out of the branch's raw (old) metal stock. */
  async payMetal(id: string, dto: MetalPaymentDto, user: AuthUser) {
    await this.findActive(id);
    await this.branches.assertAllExist([dto.branchId]);
    let fineMg = dto.fineMg;
    if (dto.netMg !== undefined) {
      if (!dto.purityPct) throw new BadRequestException('Purity is needed with the net weight');
      fineMg = fineOf(dto.netMg, dto.purityPct);
    }
    if (!fineMg || fineMg < 1) throw new BadRequestException('Give the fine weight, or the net weight and purity');
    if (dto.fromRawInventory && dto.netMg === undefined) throw new BadRequestException('Giving metal from raw inventory needs net weight and purity');
    return this.conn.transaction(async session => {
      const voucherNo = await this.numbering.next(dto.branchId, 'SP', session);
      if (dto.fromRawInventory)
        await this.raw.move({ branchId: dto.branchId, metal: dto.metal, type: 'MELT_OUT', netMg: -dto.netMg!, fineMg: -fineMg!,
          refType: 'SUPPLIER_PAYMENT', note: voucherNo, actorId: user.id }, session);
      const s = await this.moveAccounts(id, ({ [metalKey(dto.metal)]: -fineMg! } as Changes), { kind: 'PAYMENT', voucherNo, ref: dto.ref,
        branchId: oid(dto.branchId), note: dto.note, createdBy: oid(user.id) }, session);
      return { voucherNo, fineMg, ...balances(s) };
    });
  }

  /** "Rate cut": convert what we owe between cash and fine weight at the current market rate. Needs enough balance in the source account. */
  convert(id: string, dto: ConvertDto, user: AuthUser) {
    return this.conn.transaction(async session => {
      await this.findActive(id);
      const rate = await this.marketRate(dto.metal, session), m = metalKey(dto.metal);
      let ch: Changes, min: Changes, out: Record<string, number>;
      if (dto.direction === 'CASH_TO_FINE') {
        if (!dto.amountPaise) throw new BadRequestException('amountPaise is required for CASH_TO_FINE');
        const fineMg = Math.round((dto.amountPaise * 1000) / rate);
        if (fineMg < 1) throw new BadRequestException('Amount is too small to convert into fine weight');
        ch = { cash: -dto.amountPaise, [m]: fineMg } as Changes; min = { cash: dto.amountPaise }; out = { amountPaise: dto.amountPaise, fineMg };
      } else {
        if (!dto.fineMg) throw new BadRequestException('fineMg is required for FINE_TO_CASH');
        const amountPaise = Math.round((dto.fineMg * rate) / 1000);
        ch = { cash: amountPaise, [m]: -dto.fineMg } as Changes; min = { [m]: dto.fineMg } as Changes; out = { amountPaise, fineMg: dto.fineMg };
      }
      const s = await this.moveAccounts(id, ch, { kind: 'CONVERSION', rateGramPaise: rate, cashPaise: out.amountPaise, createdBy: oid(user.id) }, session, min);
      return { ...out, rateGramPaise: rate, ...balances(s) };
    });
  }

  async statement(id: string, q: SupplierStatementQueryDto) {
    await this.findOne(id);
    const f: Record<string, any> = { supplierId: oid(id) };
    if (q.account) f.account = q.account;
    const [items, total] = await Promise.all([
      this.ledger.find(f).sort({ at: -1, _id: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), this.ledger.countDocuments(f)]);
    return { items, total, page: q.page, limit: q.limit };
  }

  /** Admin correction of the CASH balance (metal balances are corrected with a metal payment / conversion). */
  adjust(id: string, dto: SupplierAdjustDto, user: AuthUser) {
    return this.conn.transaction(async session => {
      const s = await this.move(id, dto.type === 'INCREASE' ? dto.amountPaise : -dto.amountPaise,
        { kind: 'MANUAL', note: dto.reason, createdBy: oid(user.id) }, session);
      return balances(s);
    });
  }
}
