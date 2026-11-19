import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { escapeRegex } from '../../common/dto/page-query.dto';
import { Customer } from './customer.schema';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(@InjectModel(Customer.name) private model: Model<Customer>) {}

  async create(dto: CreateCustomerDto, actorId: string) {
    try { return await this.model.create({ ...dto, createdBy: new Types.ObjectId(actorId) }); }
    catch (e: any) { if (e.code === 11000) throw new ConflictException('Mobile already registered'); throw e; }
  }
  /** Existing customer with this mobile wins (never overwritten); otherwise create. */
  async upsertByMobile(dto: CreateCustomerDto, actorId: string) {
    const existing = await this.model.findOne({ mobile: dto.mobile });
    if (existing) return { customer: existing, created: false };
    try { return { customer: await this.model.create({ ...dto, createdBy: new Types.ObjectId(actorId) }), created: true }; }
    catch (e: any) {
      if (e.code === 11000) return { customer: (await this.model.findOne({ mobile: dto.mobile }))!, created: false };
      throw e;
    }
  }
  /** id → {name, mobile} for a set of customers (used to label lists). */
  async names(ids: any[]) {
    const u = [...new Set(ids.filter(Boolean).map(String))];
    if (!u.length) return new Map<string, { name: string; mobile: string }>();
    const rows = await this.model.find({ _id: { $in: u.map(i => new Types.ObjectId(i)) } }).select('name mobile').lean();
    return new Map(rows.map(r => [String(r._id), { name: r.name, mobile: r.mobile }]));
  }
  async list(page: number, limit: number, q?: string) {
    const f = q ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { mobile: new RegExp(escapeRegex(q)) }] } : {};
    const [items, total] = await Promise.all([
      this.model.find(f).sort({ name: 1 }).skip((page - 1) * limit).limit(limit), this.model.countDocuments(f)]);
    return { items, total, page, limit };
  }
  async findOne(id: string) {
    const c = await this.model.findById(id);
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }
  async update(id: string, dto: UpdateCustomerDto) {
    try {
      const c = await this.model.findByIdAndUpdate(id, { $set: dto }, { new: true });
      if (!c) throw new NotFoundException('Customer not found');
      return c;
    } catch (e: any) { if (e.code === 11000) throw new ConflictException('Mobile already registered'); throw e; }
  }
}
