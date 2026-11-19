import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { financialYearCode } from '../../engines/numbering';
import { BranchesService } from '../branches/branches.service';
import { Counter } from '../catalog/counter.schema';

/** PREFIX-CODE-FY-000001, one counter per branch + code + financial year. Pass the transaction session to stay gap-free. */
@Injectable()
export class NumberingService {
  constructor(@InjectModel(Counter.name) private counters: Model<any>, private branches: BranchesService) {}
  async next(branchId: string, code: string, session?: ClientSession) {
    const branch = await this.branches.findOne(branchId);
    const fy = financialYearCode();
    const c = await this.counters.findOneAndUpdate({ _id: `${code}:${branchId}:${fy}` }, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    return `${branch.invoicePrefix}-${code}-${fy}-${String(c.seq).padStart(6, '0')}`;
  }
}
