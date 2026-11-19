import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { Model, Types } from 'mongoose';
import { Role } from '@ajay/shared';
import { env } from '../../config';
import { escapeRegex } from '../../common/dto/page-query.dto';
import { BranchesService } from '../branches/branches.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { User } from './user.schema';

export type RefreshToken = { hash: string; expiresAt: Date };

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly log = new Logger(UsersService.name);
  constructor(@InjectModel(User.name) private model: Model<User>, private branches: BranchesService) {}

  /** Seeds the first ADMIN from env when the users collection is empty. */
  async onApplicationBootstrap() {
    if (!env.ADMIN_MOBILE || !env.ADMIN_PASSWORD) return;
    if ((await this.model.countDocuments()) > 0) return;
    await this.model.create({
      name: env.ADMIN_NAME, mobile: env.ADMIN_MOBILE, role: 'ADMIN', branchIds: [],
      passwordHash: await argon2.hash(env.ADMIN_PASSWORD),
    });
    this.log.log('Seeded initial admin user');
  }

  private async branchIdsFor(role: Role, ids?: string[]) {
    if (role === 'ADMIN') return [];
    if (!ids?.length) throw new BadRequestException('branchIds required for OWNER and STAFF');
    await this.branches.assertAllExist(ids);
    return ids.map(i => new Types.ObjectId(i));
  }

  async create(dto: CreateUserDto, actorId: string) {
    const { password, branchIds, ...rest } = dto;
    try {
      return await this.model.create({
        ...rest, branchIds: await this.branchIdsFor(dto.role, branchIds),
        passwordHash: await argon2.hash(password), createdBy: new Types.ObjectId(actorId),
      });
    } catch (e: any) {
      if (e.code === 11000) throw new ConflictException('Mobile already registered');
      throw e;
    }
  }

  async list(page: number, limit: number, q?: string) {
    const filter = q ? { $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { mobile: new RegExp(escapeRegex(q)) }] } : {};
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
      this.model.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const u = await this.model.findById(id);
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findOne(id);
    const { password, branchIds, ...rest } = dto;
    const set: Record<string, unknown> = { ...rest };
    const role = dto.role ?? user.role;
    if (dto.role || dto.branchIds)
      set.branchIds = await this.branchIdsFor(role, dto.branchIds ?? user.branchIds.map(String));
    if (password) set.passwordHash = await argon2.hash(password);
    // Password change or deactivation revokes every session.
    if (password || dto.active === false) set.refreshTokens = [];
    return this.model.findByIdAndUpdate(id, { $set: set }, { new: true });
  }

  // ---- used by auth ----
  findActiveById(id: string) { return this.model.findOne({ _id: id, active: true }).lean(); }
  findByMobileWithSecrets(mobile: string) { return this.model.findOne({ mobile }).select('+passwordHash +refreshTokens'); }
  findByIdWithSecrets(id: string) { return this.model.findById(id).select('+refreshTokens'); }
  setRefreshTokens(id: string, tokens: RefreshToken[], markLogin = false) {
    return this.model.updateOne({ _id: id }, { $set: { refreshTokens: tokens, ...(markLogin && { lastLoginAt: new Date() }) } });
  }
}
