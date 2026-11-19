import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import * as QRCode from 'qrcode';
import { Model, Types } from 'mongoose';
import { env } from '../../config';
import { escapeRegex } from '../../common/dto/page-query.dto';
import { CategoriesService } from './categories.service';
import { Counter } from './counter.schema';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/catalog.dto';
import { Product } from './product.schema';

const PREFIX = { GOLD: 'G', SILVER: 'S', DIAMOND: 'D' } as const;
const MAX_IMAGES = 8;
export const QR_PREFIX = 'AJ:';

/** Returns the file extension if the bytes are really a JPEG/PNG/WebP, else null. */
export function detectImage(b: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private model: Model<Product>,
    @InjectModel(Counter.name) private counters: Model<any>,
    private categories: CategoriesService,
  ) {}

  private async nextSku(metal: keyof typeof PREFIX) {
    const p = PREFIX[metal];
    const c = await this.counters.findOneAndUpdate({ _id: `sku:${p}` }, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return `${p}-${String(c.seq).padStart(6, '0')}`;
  }

  async create(dto: CreateProductDto, actorId: string) {
    await this.categories.assertPair(dto.categoryId, dto.subcategoryId);
    const netMg = dto.netMg ?? dto.grossMg;
    if (netMg > dto.grossMg) throw new BadRequestException('netMg cannot exceed grossMg');
    const karat = dto.metal === 'GOLD' ? dto.karat : undefined;
    let purityPct = dto.purityPct;
    if (dto.metal === 'GOLD') {
      if (!karat) throw new BadRequestException('karat (24, 22 or 18) is required for gold');
      purityPct ??= karat === 22 ? 91.6 : karat === 18 ? 75 : 100;   // 24K = 100%, 22K = 91.6%, 18K = 75%
    } else if (purityPct === undefined) throw new BadRequestException('purityPct is required for silver and diamond');
    const sku = (dto.sku ?? (await this.nextSku(dto.metal))).toUpperCase();
    try {
      return await this.model.create({
        ...dto, purityPct, karat, sku, netMg, shortName: dto.shortName ?? dto.name.slice(0, 16),
        categoryId: new Types.ObjectId(dto.categoryId), subcategoryId: new Types.ObjectId(dto.subcategoryId),
        qrPayload: QR_PREFIX + sku, createdBy: new Types.ObjectId(actorId),
      });
    } catch (e: any) {
      if (e.code === 11000) throw new ConflictException('SKU already exists');
      throw e;
    }
  }

  async list(q: ProductQueryDto) {
    const f: Record<string, unknown> = { active: q.active !== 'false' };
    if (q.metal) f.metal = q.metal;
    if (q.categoryId) f.categoryId = new Types.ObjectId(q.categoryId);
    if (q.subcategoryId) f.subcategoryId = new Types.ObjectId(q.subcategoryId);
    if (q.q) { const rx = new RegExp(escapeRegex(q.q), 'i'); f.$or = [{ name: rx }, { sku: rx }]; }
    const [items, total] = await Promise.all([
      this.model.find(f).sort({ name: 1 }).skip((q.page - 1) * q.limit).limit(q.limit),
      this.model.countDocuments(f),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }

  async findOne(id: string) {
    const p = await this.model.findById(id);
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  /** Scan lookup: accepts the QR text ("AJ:<SKU>") or the plain SKU typed by hand. */
  async findByCode(code: string) {
    const sku = (code.startsWith(QR_PREFIX) ? code.slice(QR_PREFIX.length) : code).toUpperCase();
    const p = await this.model.findOne({ sku, active: true });
    if (!p) throw new NotFoundException('No product for this code');
    return p;
  }

  async update(id: string, dto: UpdateProductDto) {
    const cur = await this.findOne(id);
    const { sku: _ignored, ...rest } = dto; // SKU and QR are immutable
    const gross = rest.grossMg ?? cur.grossMg, net = rest.netMg ?? cur.netMg;
    if (net > gross) throw new BadRequestException('netMg cannot exceed grossMg');
    if ((rest.metal ?? cur.metal) === 'GOLD' && !(rest.karat ?? cur.karat)) throw new BadRequestException('karat (24, 22 or 18) is required for gold');
    if (rest.categoryId || rest.subcategoryId)
      await this.categories.assertPair(rest.categoryId ?? String(cur.categoryId), rest.subcategoryId ?? String(cur.subcategoryId));
    return this.model.findByIdAndUpdate(id, { $set: rest }, { new: true });
  }

  qrPng(p: Product) { return QRCode.toBuffer(p.qrPayload, { margin: 1, width: 300 }); }

  async addImage(id: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    const ext = detectImage(file.buffer);
    if (!ext) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');
    const p = await this.findOne(id);
    if (p.images.length >= MAX_IMAGES) throw new BadRequestException(`Maximum ${MAX_IMAGES} images per product`);
    const name = `${randomBytes(16).toString('hex')}.${ext}`;
    await mkdir(env.UPLOAD_DIR, { recursive: true });
    await writeFile(join(env.UPLOAD_DIR, name), file.buffer);
    p.images.push(`/api/v1/uploads/${name}`);
    return p.save();
  }

  async removeImage(id: string, file: string) {
    const p = await this.findOne(id);
    const url = `/api/v1/uploads/${file}`;
    if (!p.images.includes(url)) throw new NotFoundException('Image not found on product');
    p.images = p.images.filter(i => i !== url);
    await p.save();
    await unlink(join(env.UPLOAD_DIR, file)).catch(() => undefined);
    return p;
  }
}
