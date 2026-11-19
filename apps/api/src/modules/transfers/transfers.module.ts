import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { Product, ProductSchema } from '../catalog/product.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { NumberingModule } from '../numbering/numbering.module';
import { Transfer, TransferSchema } from './transfer.schema';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Transfer.name, schema: TransferSchema }, { name: Product.name, schema: ProductSchema }]),
    BranchesModule, InventoryModule, NumberingModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
