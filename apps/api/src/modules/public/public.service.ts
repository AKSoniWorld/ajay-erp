import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { env } from '../../config';
import { escapeRegex } from '../../common/dto/page-query.dto';
import { Branch } from '../branches/branch.schema';
import { Category } from '../catalog/category.schema';
import { Product } from '../catalog/product.schema';
import { BranchStock } from '../inventory/stock.schema';
import { PublicQueryDto } from './public.dto';

const oid = (s: string) => new Types.ObjectId(s);
/** Only what a customer may see: no prices, making charges, costs, barcode data or exact quantities. */
const PUBLIC_FIELDS = 'name shortName sku metal karat purityPct grossMg netMg images categoryId subcategoryId';

@Injectable()
export class PublicService {
  constructor(
    @InjectModel(Product.name) private products: Model<Product>,
    @InjectModel(BranchStock.name) private stock: Model<BranchStock>,
    @InjectModel(Branch.name) private branches: Model<Branch>,
    @InjectModel(Category.name) private categories: Model<Category>,
  ) {}

  /** wa.me link with the product filled in. Branch number (10-digit Indian mobile) → +91…; else the shop-wide default. */
  private whatsapp(b: { name: string; whatsappNumber?: string } | undefined, p: { name: string; sku: string }) {
    const number = b?.whatsappNumber ? `91${b.whatsappNumber}` : env.PUBLIC_WHATSAPP_DEFAULT;
    if (!number) return null;
    const text = `Hi, I'm interested in ${p.name} (SKU ${p.sku})${b ? ` at ${b.name}` : ''}`;
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  }

  private async shape(prods: any[]) {
    const [stock, branches, cats] = await Promise.all([
      this.stock.find({ productId: { $in: prods.map(p => p._id) }, qty: { $gt: 0 } }).select('productId branchId').lean(),
      this.branches.find({ active: true }).select('name address state whatsappNumber').lean(),
      this.categories.find().select('name').lean(),
    ]);
    const bMap = new Map(branches.map(b => [String(b._id), b])), cMap = new Map(cats.map(c => [String(c._id), c.name]));
    return prods.map(p => ({
      _id: p._id, name: p.name, shortName: p.shortName, sku: p.sku, metal: p.metal, karat: p.karat, purityPct: p.purityPct,
      grossMg: p.grossMg, netMg: p.netMg, images: p.images,
      category: cMap.get(String(p.categoryId)) ?? '', subcategory: cMap.get(String(p.subcategoryId)) ?? '',
      availability: stock.filter(s => String(s.productId) === String(p._id) && bMap.has(String(s.branchId))).map(s => {
        const b: any = bMap.get(String(s.branchId));
        return { branchId: String(s.branchId), branch: b.name, address: b.address ?? '', inStock: true, whatsapp: this.whatsapp(b, p) };
      }),
      enquiry: this.whatsapp(undefined, p),                          // shop-wide WhatsApp link (when no branch is chosen)
    }));
  }

  async list(q: PublicQueryDto) {
    const f: Record<string, any> = { active: true };
    if (q.metal) f.metal = q.metal;
    if (q.categoryId) f.categoryId = oid(q.categoryId);
    if (q.subcategoryId) f.subcategoryId = oid(q.subcategoryId);
    if (q.q) { const rx = new RegExp(escapeRegex(q.q), 'i'); f.$or = [{ name: rx }, { sku: rx }]; }
    if (q.branchId) f._id = { $in: await this.stock.distinct('productId', { branchId: oid(q.branchId), qty: { $gt: 0 } }) };
    else if (q.inStock === 'true') f._id = { $in: await this.stock.distinct('productId', { qty: { $gt: 0 } }) };
    const [items, total] = await Promise.all([
      this.products.find(f).select(PUBLIC_FIELDS).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
      this.products.countDocuments(f),
    ]);
    return { items: await this.shape(items), total, page: q.page, limit: q.limit };
  }

  async bySku(sku: string) {
    const p = await this.products.findOne({ sku: sku.toUpperCase(), active: true }).select(PUBLIC_FIELDS).lean();
    if (!p) throw new NotFoundException('Product not found');
    return (await this.shape([p]))[0];
  }

  async categoryTree() {
    const all = await this.categories.find({ active: true }).sort({ order: 1, name: 1 }).select('name parentId').lean();
    return all.filter(c => !c.parentId).map(r => ({ _id: r._id, name: r.name, children: all.filter(c => String(c.parentId) === String(r._id)).map(c => ({ _id: c._id, name: c.name })) }));
  }

  /** Shop locations only — no GSTIN, printer or internal settings. */
  async branchList() {
    const bs = await this.branches.find({ active: true }).select('name address state whatsappNumber').sort({ name: 1 }).lean();
    return bs.map(b => ({ _id: b._id, name: b.name, address: b.address ?? '', state: b.state, whatsapp: b.whatsappNumber ? `https://wa.me/91${b.whatsappNumber}` : null }));
  }
}
