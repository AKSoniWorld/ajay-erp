import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuthUser } from '@ajay/shared';
import { BranchesService } from '../branches/branches.service';
import { Product } from '../catalog/product.schema';
import { InventoryService } from '../inventory/inventory.service';
import { NumberingService } from '../numbering/numbering.service';
import { CreateTransferDto, TransferQueryDto } from './dto/transfer.dto';
import { Transfer, TransferStatus } from './transfer.schema';

const oid = (s: any) => new Types.ObjectId(String(s));
const has = (u: AuthUser, branchId: any) => u.role === 'ADMIN' || u.branchIds.includes(String(branchId));

/**
 * PENDING → APPROVED → IN_TRANSIT → RECEIVED   (or REJECTED / CANCELLED before dispatch)
 * Stock leaves the source when dispatched and enters the destination when received (TRANSFER_OUT / TRANSFER_IN movements).
 */
@Injectable()
export class TransfersService {
  constructor(
    @InjectModel(Transfer.name) private model: Model<Transfer>,
    @InjectModel(Product.name) private products: Model<Product>,
    @InjectConnection() private conn: Connection,
    private inventory: InventoryService, private branches: BranchesService, private numbering: NumberingService,
  ) {}

  private async load(id: string, user: AuthUser, session?: ClientSession) {
    const t = await this.model.findById(id).session(session ?? null);
    if (!t || !(has(user, t.fromBranchId) || has(user, t.toBranchId))) throw new NotFoundException('Transfer not found');
    return t;
  }

  /** Guarded status change + history line; fails if the transfer is not in an allowed state. */
  private async transition(id: string, from: TransferStatus[], to: TransferStatus, user: AuthUser,
    set: Record<string, unknown>, note?: string, session?: ClientSession) {
    const t = await this.model.findOneAndUpdate({ _id: id, status: { $in: from } },
      { $set: { status: to, ...set }, $push: { history: { status: to, at: new Date(), by: user.id, ...(note ? { note } : {}) } } },
      { new: true, session });
    if (!t) throw new ConflictException(`Transfer must be ${from.join(' or ')} for this action`);
    return t;
  }

  async create(dto: CreateTransferDto, user: AuthUser) {
    if (dto.fromBranchId === dto.toBranchId) throw new BadRequestException('Source and destination must be different branches');
    if (!has(user, dto.fromBranchId) && !has(user, dto.toBranchId)) throw new ForbiddenException('You can only request transfers for your own branches');
    await this.branches.assertAllExist([dto.fromBranchId, dto.toBranchId]);
    const ids = dto.items.map(i => i.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each product can appear once; increase qty instead');
    const prods = await this.products.find({ _id: { $in: ids }, active: true }).lean();
    const byId = new Map(prods.map(p => [String(p._id), p]));
    const have = await this.inventory.branchQty(dto.fromBranchId, ids);
    const items = dto.items.map(i => {
      const p = byId.get(i.productId);
      if (!p) throw new BadRequestException(`Product ${i.productId} not found or inactive`);
      if ((have.get(i.productId) ?? 0) < i.qty) throw new BadRequestException(`Not enough stock of ${p.sku} at the source branch`);
      return { productId: p._id, sku: p.sku, name: p.name, qty: i.qty };
    });
    const number = await this.numbering.next(dto.fromBranchId, 'TR');
    return this.model.create({
      number, fromBranchId: oid(dto.fromBranchId), toBranchId: oid(dto.toBranchId), items, note: dto.note,
      requestedBy: oid(user.id), history: [{ status: 'PENDING', at: new Date(), by: user.id, ...(dto.note ? { note: dto.note } : {}) }],
    } as any);
  }

  /** Source-branch owner (or admin) approves; nobody but an admin approves their own request. */
  async approve(id: string, user: AuthUser) {
    const t = await this.load(id, user);
    if (!has(user, t.fromBranchId)) throw new ForbiddenException('Only the source branch owner or an admin can approve');
    if (user.role !== 'ADMIN' && String(t.requestedBy) === user.id) throw new ForbiddenException('You cannot approve your own request');
    return this.transition(id, ['PENDING'], 'APPROVED', user, { approvedBy: oid(user.id), approvedAt: new Date() });
  }

  async reject(id: string, reason: string, user: AuthUser) {
    const t = await this.load(id, user);
    if (!has(user, t.fromBranchId)) throw new ForbiddenException('Only the source branch owner or an admin can reject');
    return this.transition(id, ['PENDING', 'APPROVED'], 'REJECTED', user, {}, reason);
  }

  async cancel(id: string, reason: string, user: AuthUser) {
    const t = await this.load(id, user);
    if (!(has(user, t.fromBranchId) || String(t.requestedBy) === user.id)) throw new ForbiddenException('Only the requester or the source branch can cancel');
    return this.transition(id, ['PENDING', 'APPROVED'], 'CANCELLED', user, {}, reason);
  }

  /** Source branch hands the goods over: stock leaves the source now. */
  dispatch(id: string, note: string | undefined, user: AuthUser) {
    return this.conn.transaction(async session => {
      const cur = await this.load(id, user, session);
      if (!has(user, cur.fromBranchId)) throw new ForbiddenException('Only the source branch can dispatch');
      const t = await this.transition(id, ['APPROVED'], 'IN_TRANSIT', user, { dispatchedBy: oid(user.id), dispatchedAt: new Date() }, note, session);
      for (const i of t.items) {
        try {
          await this.inventory.move({ productId: String(i.productId), branchId: String(t.fromBranchId), type: 'TRANSFER_OUT', qty: -i.qty,
            refType: 'TRANSFER', refId: String(t._id), note: t.number, actorId: user.id }, session);
        } catch (e: any) {
          if (e.message === 'Insufficient stock') throw new BadRequestException(`Insufficient stock for ${i.sku} at the source branch`);
          throw e;
        }
      }
      return t;
    });
  }

  /** Destination branch confirms the goods arrived: stock enters the destination now. */
  receive(id: string, note: string | undefined, user: AuthUser) {
    return this.conn.transaction(async session => {
      const cur = await this.load(id, user, session);
      if (!has(user, cur.toBranchId)) throw new ForbiddenException('Only the destination branch can receive');
      const t = await this.transition(id, ['IN_TRANSIT'], 'RECEIVED', user, { receivedBy: oid(user.id), receivedAt: new Date() }, note, session);
      for (const i of t.items)
        await this.inventory.move({ productId: String(i.productId), branchId: String(t.toBranchId), type: 'TRANSFER_IN', qty: i.qty,
          refType: 'TRANSFER', refId: String(t._id), note: t.number, actorId: user.id }, session);
      return t;
    });
  }

  async list(q: TransferQueryDto, user: AuthUser) {
    const f: Record<string, any> = {};
    if (q.status) f.status = q.status;
    if (q.branchId) f.$or = [{ fromBranchId: oid(q.branchId) }, { toBranchId: oid(q.branchId) }];
    else if (user.role !== 'ADMIN') {
      const ids = user.branchIds.map(oid);
      f.$or = [{ fromBranchId: { $in: ids } }, { toBranchId: { $in: ids } }];
    }
    const [items, total] = await Promise.all([
      this.model.find(f).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), this.model.countDocuments(f)]);
    return { items, total, page: q.page, limit: q.limit };
  }

  get(id: string, user: AuthUser) { return this.load(id, user); }
}
