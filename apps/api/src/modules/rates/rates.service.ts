import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Metal, Rate, RateKind } from './rate.schema';
import { RateHistoryQueryDto, SetRateDto } from './dto/rate.dto';

const MAX_UNCONFIRMED_CHANGE = 0.10; // >10% move needs explicit confirmation (fat-finger guard)

/** GOLD_22K, GOLD_18K or SILVER — the key POS pricing uses to pick a rate. */
export const gradeKey = (metal: Metal, karat?: number) => (metal === 'GOLD' ? `GOLD_${karat}K` : 'SILVER');
const GRADES: { key: string; metal: Metal; karat?: number }[] = [
  { key: 'GOLD_24K', metal: 'GOLD', karat: 24 }, { key: 'GOLD_22K', metal: 'GOLD', karat: 22 }, { key: 'GOLD_18K', metal: 'GOLD', karat: 18 }, { key: 'SILVER', metal: 'SILVER' },
];

@Injectable()
export class RatesService {
  constructor(@InjectModel(Rate.name) private model: Model<Rate>) {}

  /** Latest rate for a grade; with `asOf` = the rate that was in force at that moment (used for offline sales). */
  latest(metal: Metal, kind: RateKind, karat?: number, session?: ClientSession, asOf?: Date) {
    const f: Record<string, any> = metal === 'GOLD' ? { metal, kind, karat } : { metal, kind };
    if (asOf) f.at = { $lte: asOf };
    return this.model.findOne(f).sort({ at: -1, _id: -1 }).session(session ?? null).lean();
  }

  /** Current sale rate per grade (sequential awaits: safe inside a transaction session). */
  currentSale(session?: ClientSession, asOf?: Date) { return this.currentByKind('SALE', session, asOf); }

  async currentByKind(kind: RateKind, session?: ClientSession, asOf?: Date) {
    const out: Record<string, { rateId: string; ratePerGramPaise: number }> = {};
    for (const g of GRADES) {
      const r = await this.latest(g.metal, kind, g.karat, session, asOf);
      if (r) out[g.key] = { rateId: String(r._id), ratePerGramPaise: r.ratePerGramPaise };
    }
    return out;
  }

  async current() {
    const out: Record<string, Record<string, unknown>> = {};
    for (const g of GRADES) {
      out[g.key] = {};
      for (const k of ['SALE', 'EXCHANGE', 'MARKET'] as RateKind[]) {
        const r = await this.latest(g.metal, k, g.karat);
        out[g.key][k] = r ? { id: r._id, ratePerGramPaise: r.ratePerGramPaise, at: r.at } : null;
      }
    }
    return out;
  }

  async set(dto: SetRateDto, actorId: string) {
    if (dto.metal === 'GOLD' && !dto.karat) throw new BadRequestException('karat (22 or 18) is required for gold rates');
    const karat = dto.metal === 'GOLD' ? dto.karat : undefined; // silver has one rate, no purity
    const prev = await this.latest(dto.metal, dto.kind, karat);
    if (prev && !dto.confirmLargeChange) {
      const change = Math.abs(dto.ratePerGramPaise - prev.ratePerGramPaise) / prev.ratePerGramPaise;
      if (change > MAX_UNCONFIRMED_CHANGE)
        throw new BadRequestException('Rate changed by more than 10%. Re-submit with confirmLargeChange=true if this is correct.');
    }
    const { confirmLargeChange, ...rest } = dto;
    return this.model.create({ ...rest, karat, setBy: new Types.ObjectId(actorId) });
  }

  async history(q: RateHistoryQueryDto) {
    const f: Record<string, unknown> = {};
    if (q.metal) f.metal = q.metal;
    if (q.karat) f.karat = q.karat;
    if (q.kind) f.kind = q.kind;
    const [items, total] = await Promise.all([
      this.model.find(f).sort({ at: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      this.model.countDocuments(f),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
}
