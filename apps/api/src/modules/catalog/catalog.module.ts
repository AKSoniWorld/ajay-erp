import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryModule } from '../inventory/inventory.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category, CategorySchema } from './category.schema';
import { Counter, CounterSchema } from './counter.schema';
import { Product, ProductSchema } from './product.schema';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    InventoryModule,
  ],
  controllers: [CategoriesController, ProductsController, UploadsController],
  providers: [CategoriesService, ProductsService],
  exports: [ProductsService, CategoriesService],
})
export class CatalogModule {}
