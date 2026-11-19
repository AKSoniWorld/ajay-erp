import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from '../catalog/category.schema';
import { Product, ProductSchema } from '../catalog/product.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { CustomersModule } from '../customers/customers.module';
import { DairyScheme, DairySchemeSchema } from '../dairy/dairy.schema';
import { DairyModule } from '../dairy/dairy.module';
import { BranchStock, BranchStockSchema } from '../inventory/stock.schema';
import { PosModule } from '../pos/pos.module';
import { RatesModule } from '../rates/rates.module';
import { SyncController } from './sync.controller';
import { SyncOp, SyncOpSchema } from './sync.schema';
import { SyncService } from './sync.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SyncOp.name, schema: SyncOpSchema }, { name: Product.name, schema: ProductSchema }, { name: Category.name, schema: CategorySchema },
      { name: Customer.name, schema: CustomerSchema }, { name: BranchStock.name, schema: BranchStockSchema }, { name: DairyScheme.name, schema: DairySchemeSchema },
    ]),
    PosModule, DairyModule, CustomersModule, RatesModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
