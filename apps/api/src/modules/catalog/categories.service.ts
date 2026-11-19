import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category } from './category.schema';
import { UpdateCategoryDto } from './dto/catalog.dto';

@Injectable()
export class CategoriesService {
  constructor(@InjectModel(Category.name) private model: Model<Category>) {}

  async create(dto: { name: string; order?: number }, parentId?: string) {
    if (parentId && !(await this.model.exists({ _id: parentId, parentId: null, active: true })))
      throw new BadRequestException('Unknown category');
    try {
      return await this.model.create({ name: dto.name, order: dto.order ?? 0, parentId: parentId ? new Types.ObjectId(parentId) : null });
    } catch (e: any) {
      if (e.code === 11000) throw new ConflictException('Name already exists at this level');
      throw e;
    }
  }

  async tree() {
    const all = await this.model.find({ active: true }).sort({ order: 1, name: 1 }).lean();
    return all.filter(c => !c.parentId).map(r => ({
      ...r, children: all.filter(c => String(c.parentId) === String(r._id)),
    }));
  }

  async update(id: string, dto: UpdateCategoryDto) {
    try {
      const c = await this.model.findByIdAndUpdate(id, { $set: dto }, { new: true });
      if (!c) throw new NotFoundException('Not found');
      return c;
    } catch (e: any) {
      if (e.code === 11000) throw new ConflictException('Name already exists at this level');
      throw e;
    }
  }

  async assertPair(categoryId: string, subcategoryId: string) {
    const ok = await this.model.exists({ _id: subcategoryId, parentId: new Types.ObjectId(categoryId), active: true });
    if (!ok) throw new BadRequestException('Subcategory does not belong to the given category');
  }
}
