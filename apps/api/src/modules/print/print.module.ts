import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { Product, ProductSchema } from '../catalog/product.schema';
import { PdfService } from './pdf.service';
import { PrintController } from './print.controller';
import { TagService } from './tag.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]), BranchesModule],
  controllers: [PrintController],
  providers: [PdfService, TagService],
  exports: [PdfService],
})
export class PrintModule {}
