import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { istRange } from '../../common/utils/time';
import { dairyStatusFromPaid } from '../../engines/dairy.engine';
import { CustomerAccount } from '../accounts/account.schema';
import { Exchange } from '../exchange/exchange.schema';
import { Supplier } from '../suppliers/supplier.schema';
import { Transfer } from '../transfers/transfer.schema';
import { ReportQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

const blank = () => ({ invoices: 0, salesPaise: 0, returnsPaise: 0, netPaise: 0, gstPaise: 0 });
const add = (t: any, g: any) => {
  t.invoices += g.invoices; t.salesPaise += g.salesPaise; t.returnsPaise += g.returnsPaise;
  t.netPaise += g.salesPaise - g.returnsPaise; t.gstPaise += g.gstPaise;
};

/** Head-office overview across all branches: sales, stock, dairy, old metal, and what customers/suppliers owe. */
@Injectable()
export class DashboardService {
  constructor(
    private reports: ReportsService,
    @InjectModel(Exchange.name) private exchanges: Model<Exchange>,
    @InjectModel(Transfer.name) private transfers: Model<Transfer>,
    @InjectModel(CustomerAccount.name) private accounts: Model<CustomerAccount>,
    @InjectModel(Supplier.name) private suppliers: Model<Supplier>,
  ) {}

  private async salesFor(from: Date, to: Date, names: Map<string, string>) {
    const groups = await this.reports.invoiceGroups({ status: 'FINAL', finalizedAt: { $gte: from, $lt: to } },
      { branchId: '$branchId', taxMode: { $ifNull: ['$taxMode', 'GST'] } });
    const total = blank(), byTaxMode: Record<string, any> = { GST: blank(), NON_GST: blank() }, byBranch = new Map<string, any>();
    for (const g of groups) {
      add(total, g); add(byTaxMode[g._id.taxMode], g);
      const id = String(g._id.branchId);
      if (!byBranch.has(id)) byBranch.set(id, { branchId: id, branch: names.get(id) ?? '', ...blank() });
      add(byBranch.get(id), g);
    }
    return { total, byTaxMode, byBranch: [...byBranch.values()].sort((a, b) => b.netPaise - a.netPaise) };
  }

  async headOffice(q: ReportQueryDto) {
    const r = this.reports.range(q), names = await this.reports.branchNames();
    const t = istRange(undefined, undefined), todayStr = t.toStr, today = istRange(todayStr, todayStr);
    const inRange = { at: { $gte: r.from, $lt: r.to } };

    const [salesPeriod, salesToday, stockRows, rawRows, inTransit, schemes, collected, exchange, cust, sup] = await Promise.all([
      this.salesFor(r.from, r.to, names), this.salesFor(today.from, today.to, names),
      this.reports.stock.aggregate([{ $group: { _id: '$branchId', pieces: { $sum: '$qty' },
        products: { $sum: { $cond: [{ $gt: ['$qty', 0] }, 1, 0] } }, negative: { $sum: { $cond: [{ $lt: ['$qty', 0] }, 1, 0] } } } }]),
      this.reports.rawStock.find().lean(),
      this.transfers.aggregate([{ $match: { status: 'IN_TRANSIT' } }, { $unwind: '$items' },
        { $group: { _id: null, transfers: { $addToSet: '$_id' }, pieces: { $sum: '$items.qty' } } }]),
      this.reports.dairySchemes.find().select('branchId startDate monthlyPaise durationMonths schemeType bonusInstallments paidPaise balancePaise').lean(),
      this.reports.dairyPayments.aggregate([{ $match: inRange }, { $group: { _id: { branchId: '$branchId', mode: '$mode' }, amount: { $sum: '$amountPaise' } } }]),
      this.exchanges.aggregate([{ $match: inRange }, { $group: { _id: '$branchId', gold: { $sum: '$totals.goldFineMg' }, silver: { $sum: '$totals.silverFineMg' },
        value: { $sum: { $add: [{ $ifNull: ['$totals.goldValuePaise', 0] }, { $ifNull: ['$totals.silverValuePaise', 0] }] } } } }]),
      this.accounts.aggregate([{ $group: { _id: null, advance: { $sum: '$advancePaise' }, due: { $sum: '$duePaise' } } }]),
      this.suppliers.aggregate([{ $group: { _id: null, cash: { $sum: '$balancePaise' }, gold: { $sum: '$goldFineMg' }, silver: { $sum: '$silverFineMg' } } }]),
    ]);

    const stockByBranch = stockRows.map(s => ({ branchId: String(s._id), branch: names.get(String(s._id)) ?? '', pieces: s.pieces, products: s.products, negative: s.negative }));
    const byStatus: Record<string, number> = { ACTIVE: 0, COMPLETED: 0, MATURED_SHORTFALL: 0 };
    let missed = 0, withBalance = 0, balancePaise = 0;
    for (const s of schemes) {
      const st = dairyStatusFromPaid({ start: s.startDate, monthly: s.monthlyPaise, durationMonths: s.durationMonths as 6 | 11 | 12, type: s.schemeType, bonusInstallments: s.bonusInstallments }, s.paidPaise);
      byStatus[st.status]++; missed += st.missed; balancePaise += s.balancePaise; if (s.balancePaise > 0) withBalance++;
    }
    const byMode: Record<string, number> = {}, byBranchCollected = new Map<string, number>();
    for (const c of collected) {
      byMode[c._id.mode] = (byMode[c._id.mode] ?? 0) + c.amount;
      byBranchCollected.set(String(c._id.branchId), (byBranchCollected.get(String(c._id.branchId)) ?? 0) + c.amount);
    }

    return {
      generatedAt: new Date(), period: { from: r.fromStr, to: r.toStr },
      sales: { period: salesPeriod, today: { date: todayStr, total: salesToday.total, byTaxMode: salesToday.byTaxMode } },
      stock: { totalPieces: stockByBranch.reduce((s, b) => s + b.pieces, 0), byBranch: stockByBranch,
        inTransit: { transfers: inTransit[0]?.transfers.length ?? 0, pieces: inTransit[0]?.pieces ?? 0 },
        rawMetal: rawRows.map(x => ({ branchId: String(x.branchId), branch: names.get(String(x.branchId)) ?? '', metal: x.metal, netMg: x.netMg, fineMg: x.fineMg })) },
      dairy: { schemes: { total: schemes.length, byStatus, withBalance }, balancePaise, missedInstalments: missed,
        collected: { totalPaise: Object.values(byMode).reduce((s, v) => s + v, 0), byMode,
          byBranch: [...byBranchCollected].map(([id, amountPaise]) => ({ branchId: id, branch: names.get(id) ?? '', amountPaise })) } },
      exchange: { goldFineMg: exchange.reduce((s, e) => s + e.gold, 0), silverFineMg: exchange.reduce((s, e) => s + e.silver, 0),
        valuePaise: exchange.reduce((s, e) => s + e.value, 0),
        byBranch: exchange.map(e => ({ branchId: String(e._id), branch: names.get(String(e._id)) ?? '', goldFineMg: e.gold, silverFineMg: e.silver, valuePaise: e.value })) },
      accounts: { customerAdvancePaise: cust[0]?.advance ?? 0, customerDuePaise: cust[0]?.due ?? 0,
        supplierPayable: { cashPaise: sup[0]?.cash ?? 0, goldFineMg: sup[0]?.gold ?? 0, silverFineMg: sup[0]?.silver ?? 0 } },
    };
  }
}
