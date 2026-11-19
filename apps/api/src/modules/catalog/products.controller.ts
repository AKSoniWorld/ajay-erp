import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, StreamableFile,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '@ajay/shared';
import { memoryStorage } from 'multer';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { InventoryService } from '../inventory/inventory.service';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/catalog.dto';
import { ProductsService } from './products.service';

const png = (b: Buffer) => new StreamableFile(b, { type: 'image/png' });

@Controller('products')
export class ProductsController {
  constructor(private svc: ProductsService, private inventory: InventoryService) {}

  @Post() @RequirePermission('product.write')
  create(@Body() dto: CreateProductDto, @CurrentUser() u: AuthUser) { return this.svc.create(dto, u.id); }

  @Get() @RequirePermission('product.read')
  async list(@Query() q: ProductQueryDto) {
    const r = await this.svc.list(q);
    if (!q.branchId) return r;
    const qty = await this.inventory.branchQty(q.branchId, r.items.map(p => String(p._id)));   // the branch scope guard has checked branchId
    return { ...r, items: r.items.map(p => ({ ...p.toJSON(), stockQty: qty.get(String(p._id)) ?? 0 })) };
  }

  @Get('by-code/:code') @RequirePermission('product.read')
  byCode(@Param('code') code: string) { return this.svc.findByCode(code); }

  @Get(':id') @RequirePermission('product.read')
  async one(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() u: AuthUser) {
    const p = await this.svc.findOne(id);
    const availability = await this.inventory.availability(id, u.role === 'ADMIN' ? undefined : u.branchIds);
    return { ...p.toJSON(), availability };
  }

  @Patch(':id') @RequirePermission('product.write')
  async update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateProductDto, @Req() req: any) {
    req.auditBefore = (await this.svc.findOne(id)).toJSON();
    return this.svc.update(id, dto);
  }

  @Get(':id/qr.png') @RequirePermission('product.read')
  async qr(@Param('id', ParseObjectIdPipe) id: string) { return png(await this.svc.qrPng(await this.svc.findOne(id))); }

  @Post(':id/images') @RequirePermission('product.write')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } }))
  addImage(@Param('id', ParseObjectIdPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    return this.svc.addImage(id, file);
  }

  @Delete(':id/images/:file') @RequirePermission('product.write')
  removeImage(@Param('id', ParseObjectIdPipe) id: string, @Param('file') file: string) {
    return this.svc.removeImage(id, file);
  }
}
