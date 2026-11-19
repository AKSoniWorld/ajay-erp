import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { escapeRegex } from '../../common/dto/page-query.dto';
import { BranchesService } from '../branches/branches.service';
import { Product } from '../catalog/product.schema';
import { BranchStock, MovementType, StockMovement } from './stock.schema';

const SIGN: Record<MovementType, 1 | -1 | 0> = {
  OPENING: 1, PURCHASE: 1, SALE: -1, TRANSFER_OUT: -1, TRANSFER_IN: 1, RETURN: 1, ADJUST: 0,
};
const oid = (s: string) => new Types.ObjectId(s);

export interface MoveInput {
  productId: string; branchId: string; type: MovementType; qty: number;
  refType?: string; refId?: string; note?: string; actorId?: string;
  allowNegative?: boolean; // offline-sync oversell (flagged later); default false
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(BranchStock.name) private stock: Model<BranchStock>,
    @InjectModel(StockMovement.name) private moves: Model<StockMovement>,
    @InjectModel(Product.name) private products: Model<Product>,
    @InjectConnection() private conn: Connection,
    private branches: BranchesService,
  ) {}

  /**
   * THE ONLY place stock changes. Atomically updates BranchStock and appends a StockMovement.
   * Pass a session to join a larger transaction (e.g. invoice finalize in Phase 3).
   */
  async move(i: MoveInput, session?: ClientSession) {
    if (!Number.isInteger(i.qty) || i.qty === 0) throw new BadRequestException('qty must be a non-zero integer');
    const sign = SIGN[i.type];
    if (sign && Math.sign(i.qty) !== sign)
      throw new BadRequestException(`${i.type} quantity must be ${sign > 0 ? 'positive' : 'negative'}`);

    const filter: Record<string, unknown> = { productId: oid(i.productId), branchId: oid(i.branchId) };
    if (i.qty < 0 && !i.allowNegative) filter.qty = { $gte: -i.qty };
    const upsert = !('qty' in filter); // never upsert with a qty guard (would collide on the unique index)

    let stock: BranchStock | null = null;
    for (let attempt = 0; attempt < 2 && !stock; attempt++) {
      try {
        stock = await this.stock.findOneAndUpdate(filter, { $inc: { qty: i.qty } }, { new: true, upsert, session });
        break;
      } catch (e: any) {
        if (e.code !== 11000 || attempt === 1) throw e; // concurrent first-insert race → retry once
      }
    }
    if (!stock) throw new BadRequestException('Insufficient stock');

    const [movement] = await this.moves.create([{
      productId: oid(i.productId), branchId: oid(i.branchId), type: i.type, qty: i.qty,
      refType: i.refType, refId: i.refId ? oid(i.refId) : undefined, note: i.note,
      createdBy: i.actorId ? oid(i.actorId) : undefined,
    }], { session });
    return { stock, movement };
  }

  /** Manual opening stock / correction (inventory.write). */
  async adjust(dto: { productId: string; branchId: string; qty: number; type: 'OPENING' | 'ADJUST'; note?: string }, actorId: string) {
    if (!(await this.products.exists({ _id: dto.productId }))) throw new NotFoundException('Product not found');
    await this.branches.assertAllExist([dto.branchId]);
    return this.conn.transaction(session => this.move({ ...dto, refType: 'MANUAL', actorId }, session));
  }

  async stockList(scope: string[] | undefined, q: string | undefined, page: number, limit: number, branchId?: string) {
    const match: Record<string, unknown> = {};
    if (branchId) match.branchId = oid(branchId);
    else if (scope) match.branchId = { $in: scope.map(oid) };
    const stages: any[] = [
      { $match: match },
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
    ];
    if (q) { const rx = new RegExp(escapeRegex(q), 'i'); stages.push({ $match: { $or: [{ 'product.name': rx }, { 'product.sku': rx }] } }); }
    const [res] = await this.stock.aggregate([...stages, {
      $facet: {
        items: [{ $sort: { 'product.name': 1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'n' }],
      },
    }]);
    return { items: res.items, total: res.total[0]?.n ?? 0, page, limit };
  }

  async branchQty(branchId: string, productIds: string[]) {
    const rows = await this.stock.find({ branchId: oid(branchId), productId: { $in: productIds.map(oid) } }).lean();
    return new Map(rows.map(r => [String(r.productId), r.qty]));
  }

  availability(productId: string, scope?: string[]) {
    const q: Record<string, unknown> = { productId: oid(productId) };
    if (scope) q.branchId = { $in: scope.map(oid) };
    return this.stock.find(q).select('branchId qty -_id').lean();
  }

  async movements(f: { productId?: string; branchId?: string; type?: MovementType; page: number; limit: number }, scope?: string[]) {
    const q: Record<string, unknown> = {};
    if (f.productId) q.productId = oid(f.productId);
    if (f.type) q.type = f.type;
    if (f.branchId) q.branchId = oid(f.branchId);
    else if (scope) q.branchId = { $in: scope.map(oid) };
    const [items, total] = await Promise.all([
      this.moves.find(q).sort({ at: -1 }).skip((f.page - 1) * f.limit).limit(f.limit).lean(),
      this.moves.countDocuments(q),
    ]);
    const prods = await this.products.find({ _id: { $in: [...new Set(items.map(i => String(i.productId)))].map(oid) } }).select('name sku').lean();
    const byId = new Map(prods.map(p => [String(p._id), { name: p.name, sku: p.sku }]));
    return { items: items.map(i => ({ ...i, product: byId.get(String(i.productId)) ?? null })), total, page: f.page, limit: f.limit };
  }
}
