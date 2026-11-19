import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthUser } from '@ajay/shared';
import { Branch } from './branch.schema';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(@InjectModel(Branch.name) private model: Model<Branch>) {}

  async create(dto: CreateBranchDto, actorId: string) {
    if (dto.gstRegistered === false && dto.gstin) throw new BadRequestException('An unregistered branch cannot have a GSTIN');
    try { return await this.model.create({ ...dto, createdBy: new Types.ObjectId(actorId) }); }
    catch (e: any) {
      if (e.code === 11000) throw new ConflictException('Branch code or invoice prefix already exists');
      throw e;
    }
  }
  list(user: AuthUser) {
    const filter = user.role === 'ADMIN' ? {} : { _id: { $in: user.branchIds } };
    return this.model.find(filter).sort({ name: 1 });
  }
  async findOne(id: string) {
    const b = await this.model.findById(id);
    if (!b) throw new NotFoundException('Branch not found');
    return b;
  }
  async update(id: string, dto: UpdateBranchDto) {
    const cur = await this.findOne(id);
    const registered = dto.gstRegistered ?? cur.gstRegistered;
    const gstin = dto.gstin !== undefined ? dto.gstin : cur.gstin;
    if (registered === false && gstin) throw new BadRequestException('An unregistered branch cannot have a GSTIN. Remove it first (send gstin: null).');
    if (dto.gstRegistered === true && cur.gstRegistered === false && !gstin) throw new BadRequestException('A GSTIN is required to mark a branch GST-registered');
    const b = await this.model.findByIdAndUpdate(id, { $set: dto }, { new: true });
    if (!b) throw new NotFoundException('Branch not found');
    return b;
  }
  async assertAllExist(ids: string[]) {
    const unique = [...new Set(ids)];
    const n = await this.model.countDocuments({ _id: { $in: unique }, active: true });
    if (n !== unique.length) throw new BadRequestException('Unknown or inactive branch in branchIds');
  }
}
