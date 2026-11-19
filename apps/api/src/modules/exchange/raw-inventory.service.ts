import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { BranchesService } from '../branches/branches.service';
import { RawMovement, RawStock, RawType } from './raw.schema';

const oid = (s: string) => new Types.ObjectId(s);
export interface RawMoveInput {
  branchId: string; metal: 'GOLD' | 'SILVER'; type: RawType; netMg: number; fineMg: number;
  refType?: string; refId?: string; note?: string; actorId?: string;
}

@Injectable()
export class RawInventoryService {
  constructor(
    @InjectModel(RawStock.name) private stock: Model<RawStock>,
    @InjectModel(RawMovement.name) private moves: Model<RawMovement>,
    @InjectConnection() private conn: Connection,
    private branches: BranchesService,
  ) {}

  /** THE ONLY place raw-metal stock changes: updates the balance and appends a movement, atomically with the caller's session. */
  async move(i: RawMoveInput, session?: ClientSession) {
    if (!Number.isInteger(i.netMg) || !Number.isInteger(i.fineMg)) throw new BadRequestException('Weights must be whole milligrams');
    if (i.netMg === 0 && i.fineMg === 0) throw new BadRequestException('Nothing to move');
    if (Math.abs(i.fineMg) > Math.abs(i.netMg)) throw new BadRequestException('Fine weight cannot exceed net weight');
    if (i.type === 'EXCHANGE_IN' && (i.netMg < 0 || i.fineMg < 0)) throw new BadRequestException('EXCHANGE_IN must be positive');
    if (i.type === 'MELT_OUT' && (i.netMg > 0 || i.fineMg > 0)) throw new BadRequestException('MELT_OUT must be negative');

    const filter: Record<string, unknown> = { branchId: oid(i.branchId), metal: i.metal };
    let guarded = false;
    if (i.netMg < 0) { filter.netMg = { $gte: -i.netMg }; guarded = true; }
    if (i.fineMg < 0) { filter.fineMg = { $gte: -i.fineMg }; guarded = true; }

    let doc: RawStock | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        doc = await this.stock.findOneAndUpdate(filter, { $inc: { netMg: i.netMg, fineMg: i.fineMg } },
          { new: true, upsert: !guarded, session });
        break;
      } catch (e: any) { if (e.code !== 11000 || attempt === 1) throw e; }
    }
    if (!doc) throw new BadRequestException('Insufficient raw metal stock');

    const [movement] = await this.moves.create([{
      branchId: oid(i.branchId), metal: i.metal, type: i.type, netMg: i.netMg, fineMg: i.fineMg,
      refType: i.refType, refId: i.refId ? oid(i.refId) : undefined, note: i.note,
      createdBy: i.actorId ? oid(i.actorId) : undefined,
    }], { session });
    return { stock: doc, movement };
  }

  async adjust(dto: { branchId: string; metal: 'GOLD' | 'SILVER'; type: 'MELT_OUT' | 'ADJUST'; netMg: number; fineMg: number; note: string }, actorId: string) {
    await this.branches.assertAllExist([dto.branchId]);
    return this.conn.transaction(session => this.move({ ...dto, refType: 'MANUAL', actorId }, session));
  }

  list(scope: string[] | undefined, branchId?: string) {
    const f: Record<string, unknown> = {};
    if (branchId) f.branchId = oid(branchId); else if (scope) f.branchId = { $in: scope.map(oid) };
    return this.stock.find(f).sort({ branchId: 1, metal: 1 }).lean();
  }

  async movements(q: { branchId?: string; metal?: string; page: number; limit: number }, scope?: string[]) {
    const f: Record<string, unknown> = {};
    if (q.metal) f.metal = q.metal;
    if (q.branchId) f.branchId = oid(q.branchId); else if (scope) f.branchId = { $in: scope.map(oid) };
    const [items, total] = await Promise.all([
      this.moves.find(f).sort({ at: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), this.moves.countDocuments(f)]);
    return { items, total, page: q.page, limit: q.limit };
  }
}
