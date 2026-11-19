import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BranchesService } from '../branches/branches.service';
import { Product } from '../catalog/product.schema';
import { TagPrintDto, TagTestDto } from './dto/print.dto';
import { renderTag, TagLabel, TagLanguage, TagSize } from './tags';

const g = (mg: number) => (mg / 1000).toFixed(3);

@Injectable()
export class TagService {
  constructor(@InjectModel(Product.name) private products: Model<Product>, private branches: BranchesService) {}

  private async setup(branchId: string, language?: TagLanguage, tagSize?: TagSize) {
    await this.branches.assertAllExist([branchId]);
    const branch = await this.branches.findOne(branchId);
    const p: any = branch.printer ?? {};
    return { branch, language: (language ?? p.language ?? 'ESCPOS') as TagLanguage, size: (tagSize ?? p.tagSize ?? '40x25') as TagSize };
  }

  async print(dto: TagPrintDto) {
    const { branch, language, size } = await this.setup(dto.branchId, dto.language, dto.tagSize);
    const ids = dto.items.map(i => i.productId);
    const prods = await this.products.find({ _id: { $in: ids }, active: true }).lean();
    const byId = new Map(prods.map(p => [String(p._id), p]));
    const labels: TagLabel[] = [], chunks: Buffer[] = [];
    for (const it of dto.items) {
      const p = byId.get(it.productId);
      if (!p) throw new BadRequestException(`Product ${it.productId} not found or inactive`);
      const grade = p.metal === 'GOLD' ? `${p.karat}K` : p.metal === 'SILVER' ? `${p.purityPct}%` : 'Diamond';
      const label: TagLabel = { shortName: p.shortName, sku: p.sku, grade: p.metal === 'SILVER' ? `Silver ${p.purityPct}%` : grade, gross: g(p.grossMg), net: g(p.netMg),
        branchName: branch.name, qr: p.qrPayload };
      labels.push(label);
      chunks.push(renderTag(language, label, size, it.copies ?? 1));
    }
    return { language, tagSize: size, count: dto.items.reduce((s, i) => s + (i.copies ?? 1), 0),
      contentType: 'application/octet-stream', bytesBase64: Buffer.concat(chunks).toString('base64'), labels };
  }

  /** Calibration label so each branch can check alignment on its own printer. */
  async test(dto: TagTestDto) {
    const { branch, language, size } = await this.setup(dto.branchId, dto.language, dto.tagSize);
    const label: TagLabel = { shortName: 'TEST TAG', sku: 'TEST-000001', grade: '22K', gross: '10.000', net: '9.500', branchName: branch.name, qr: 'AJ:TEST-000001' };
    return { language, tagSize: size, count: 1, contentType: 'application/octet-stream',
      bytesBase64: renderTag(language, label, size, 1).toString('base64'), labels: [label] };
  }
}
