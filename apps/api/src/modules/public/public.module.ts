import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Branch, BranchSchema } from '../branches/branch.schema';
import { Category, CategorySchema } from '../catalog/category.schema';
import { Product, ProductSchema } from '../catalog/product.schema';
import { BranchStock, BranchStockSchema } from '../inventory/stock.schema';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Product.name, schema: ProductSchema }, { name: BranchStock.name, schema: BranchStockSchema },
    { name: Branch.name, schema: BranchSchema }, { name: Category.name, schema: CategorySchema }])],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
