import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { PricedExchange, summarizeExchange } from '../../engines/exchange';
import { Exchange } from './exchange.schema';
import { RawInventoryService } from './raw-inventory.service';

@Injectable()
export class ExchangeService {
  constructor(@InjectModel(Exchange.name) private model: Model<Exchange>, private raw: RawInventoryService) {}

  /** Called inside the invoice-finalize transaction: stores the exchange and adds the metal to raw inventory. */
  async record(i: {
    invoiceId: Types.ObjectId; invoiceNumber: string; branchId: Types.ObjectId; customerId?: Types.ObjectId;
    items: PricedExchange[]; editHistory: any[]; userId: string;
  }, session: ClientSession) {
    const totals = summarizeExchange(i.items);
    const [doc] = await this.model.create([{
      invoiceId: i.invoiceId, invoiceNumber: i.invoiceNumber, branchId: i.branchId, customerId: i.customerId,
      items: i.items, totals, editHistory: i.editHistory, createdBy: new Types.ObjectId(i.userId),
    }], { session });
    for (const metal of ['GOLD', 'SILVER'] as const) {
      const net = metal === 'GOLD' ? totals.goldNetMg : totals.silverNetMg;
      const fine = metal === 'GOLD' ? totals.goldFineMg : totals.silverFineMg;
      if (net > 0) await this.raw.move({ branchId: String(i.branchId), metal, type: 'EXCHANGE_IN', netMg: net, fineMg: fine,
        refType: 'EXCHANGE', refId: String(doc._id), actorId: i.userId }, session);
    }
    return doc;
  }

  async list(q: { branchId?: string; page: number; limit: number }, scope?: string[]) {
    const f: Record<string, unknown> = {};
    if (q.branchId) f.branchId = new Types.ObjectId(q.branchId);
    else if (scope) f.branchId = { $in: scope.map(s => new Types.ObjectId(s)) };
    const [items, total] = await Promise.all([
      this.model.find(f).sort({ at: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), this.model.countDocuments(f)]);
    return { items, total, page: q.page, limit: q.limit };
  }
}
