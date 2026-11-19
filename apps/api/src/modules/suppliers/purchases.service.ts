import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AuthUser } from '@ajay/shared';
import { escapeRegex } from '../../common/dto/page-query.dto';
import { BranchesService } from '../branches/branches.service';
import { Product } from '../catalog/product.schema';
import { InventoryService } from '../inventory/inventory.service';
import { NumberingService } from '../numbering/numbering.service';
import { CancelPurchaseDto, CreatePurchaseDto, PurchaseQueryDto } from './dto/supplier.dto';
import { Purchase } from './supplier.schema';
import { fineOf, SuppliersService } from './suppliers.service';

const oid = (s: any) => new Types.ObjectId(String(s));

@Injectable()
export class PurchasesService {
  constructor(
    @InjectModel(Purchase.name) private model: Model<Purchase>,
    @InjectModel(Product.name) private products: Model<Product>,
    @InjectConnection() private conn: Connection,
    private suppliers: SuppliersService, private inventory: InventoryService,
    private numbering: NumberingService, private branches: BranchesService,
  ) {}

  private assertBranch(user: AuthUser, branchId: any) {
    if (user.role !== 'ADMIN' && !user.branchIds.includes(String(branchId))) throw new NotFoundException('Purchase not found');
  }

  /**
   * One transaction: purchase record + stock-in for stock items + supplier accounts (+ optional first payment).
   * A gold/silver item marked settleInFine adds its FINE weight (net × purity %) to what we owe in metal;
   * its unitCostPaise is then only the making/labour in cash.
   */
  async create(dto: CreatePurchaseDto, user: AuthUser) {
    if (user.role !== 'ADMIN' && !user.branchIds.includes(dto.branchId)) throw new ForbiddenException('Branch access denied');
    await this.branches.assertAllExist([dto.branchId]);
    await this.suppliers.findActive(dto.supplierId);

    const ids = dto.items.filter(i => i.productId).map(i => i.productId!);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each product can appear once; increase qty instead');
    const prods = ids.length ? await this.products.find({ _id: { $in: ids }, active: true }).lean() : [];
    const byId = new Map(prods.map(p => [String(p._id), p]));
    const items = dto.items.map(i => {
      if (!i.productId && !i.description) throw new BadRequestException('Each line needs a product or a description');
      const p = i.productId ? byId.get(i.productId) : undefined;
      if (i.productId && !p) throw new BadRequestException(`Product ${i.productId} not found or inactive`);
      let fineMg = 0, metal: string | undefined;
      if (i.settleInFine) {
        if (!p || (p.metal !== 'GOLD' && p.metal !== 'SILVER')) throw new BadRequestException('Fine-weight settlement needs a gold or silver stock item');
        metal = p.metal; fineMg = fineOf(p.netMg, p.purityPct) * i.qty;
      }
      return { productId: p?._id, sku: p?.sku, description: i.description ?? p!.name, qty: i.qty, unitCostPaise: i.unitCostPaise,
        amountPaise: i.qty * i.unitCostPaise, settleInFine: !!i.settleInFine, metal, fineMg };
    });
    const subtotalPaise = items.reduce((s, i) => s + i.amountPaise, 0), gstPaise = dto.gstPaise ?? 0;
    const totalPaise = subtotalPaise + gstPaise, paidPaise = dto.payment?.amountPaise ?? 0;
    const fineGoldMg = items.filter(i => i.metal === 'GOLD').reduce((s, i) => s + i.fineMg, 0);
    const fineSilverMg = items.filter(i => i.metal === 'SILVER').reduce((s, i) => s + i.fineMg, 0);
    if (paidPaise > totalPaise) throw new BadRequestException('The first payment cannot exceed the cash part of the purchase');

    return this.conn.transaction(async session => {
      const number = await this.numbering.next(dto.branchId, 'PU', session);
      let p: any;
      try {
        [p] = await this.model.create([{ number, supplierId: oid(dto.supplierId), branchId: oid(dto.branchId), billNo: dto.billNo,
          billDate: dto.billDate, items, subtotalPaise, gstPaise, totalPaise, fineGoldMg, fineSilverMg, paidPaise,
          remarks: dto.remarks, createdBy: oid(user.id) }], { session });
      } catch (e: any) {
        if (e.code === 11000) throw new ConflictException('This supplier bill number has already been entered');
        throw e;
      }
      for (const i of items)
        if (i.productId) await this.inventory.move({ productId: String(i.productId), branchId: dto.branchId, type: 'PURCHASE', qty: i.qty,
          refType: 'PURCHASE', refId: String(p._id), actorId: user.id }, session);
      if (totalPaise || fineGoldMg || fineSilverMg)
        await this.suppliers.moveAccounts(dto.supplierId, { cash: totalPaise, gold: fineGoldMg, silver: fineSilverMg },
          { kind: 'PURCHASE', purchaseId: p._id, purchaseNo: number, billNo: dto.billNo, branchId: oid(dto.branchId), createdBy: oid(user.id) }, session);
      if (paidPaise) {
        const voucherNo = await this.numbering.next(dto.branchId, 'SP', session);
        await this.suppliers.move(dto.supplierId, -paidPaise, { kind: 'PAYMENT', voucherNo, mode: dto.payment!.mode, ref: dto.payment!.ref,
          purchaseId: p._id, purchaseNo: number, branchId: oid(dto.branchId), createdBy: oid(user.id) }, session);
      }
      return p;
    });
  }

  /** Admin only. Reverses stock and what we owe (cash and metal). Refused if the stock was already sold/moved. Payments already made stay on the supplier's account. */
  cancel(id: string, dto: CancelPurchaseDto, user: AuthUser) {
    return this.conn.transaction(async session => {
      const p = await this.model.findOneAndUpdate({ _id: id, status: 'ACTIVE' },
        { $set: { status: 'CANCELLED', cancelReason: dto.reason, cancelledAt: new Date(), cancelledBy: oid(user.id) } }, { new: true, session });
      if (!p) throw new ConflictException('Purchase not found or already cancelled');
      for (const i of p.items)
        if (i.productId) {
          try {
            await this.inventory.move({ productId: String(i.productId), branchId: String(p.branchId), type: 'ADJUST', qty: -i.qty,
              refType: 'PURCHASE_CANCEL', refId: String(p._id), note: `Purchase ${p.number} cancelled`, actorId: user.id }, session);
          } catch (e: any) {
            if (e.message === 'Insufficient stock') throw new BadRequestException(`Cannot cancel: stock of ${i.sku} has already been sold or moved`);
            throw e;
          }
        }
      if (p.totalPaise || p.fineGoldMg || p.fineSilverMg)
        await this.suppliers.moveAccounts(String(p.supplierId), { cash: -p.totalPaise, gold: -p.fineGoldMg, silver: -p.fineSilverMg },
          { kind: 'PURCHASE_CANCEL', purchaseId: p._id, purchaseNo: p.number, billNo: p.billNo, branchId: p.branchId, note: dto.reason, createdBy: oid(user.id) }, session);
      return p;
    });
  }

  async list(q: PurchaseQueryDto, user: AuthUser) {
    const f: Record<string, any> = {};
    if (q.branchId) f.branchId = oid(q.branchId);
    else if (user.role !== 'ADMIN') f.branchId = { $in: user.branchIds.map(oid) };
    if (q.supplierId) f.supplierId = oid(q.supplierId);
    if (q.status) f.status = q.status;
    if (q.q) f.$or = [{ number: new RegExp(escapeRegex(q.q), 'i') }, { billNo: new RegExp(escapeRegex(q.q), 'i') }];
    const [items, total] = await Promise.all([
      this.model.find(f).sort({ billDate: -1, createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), this.model.countDocuments(f)]);
    const names = await this.suppliers.names(items.map(i => i.supplierId));
    return { items: items.map(i => ({ ...i, supplierName: names.get(String(i.supplierId)) ?? null })), total, page: q.page, limit: q.limit };
  }

  async get(id: string, user: AuthUser) {
    const p = await this.model.findById(id);
    if (!p) throw new NotFoundException('Purchase not found');
    this.assertBranch(user, p.branchId);
    return p;
  }
}
