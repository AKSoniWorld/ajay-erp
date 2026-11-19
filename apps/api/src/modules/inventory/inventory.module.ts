import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { Product, ProductSchema } from '../catalog/product.schema';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { BranchStock, BranchStockSchema, StockMovement, StockMovementSchema } from './stock.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BranchStock.name, schema: BranchStockSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    BranchesModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
