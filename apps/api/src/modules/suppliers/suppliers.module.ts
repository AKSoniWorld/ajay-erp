import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { Product, ProductSchema } from '../catalog/product.schema';
import { ExchangeModule } from '../exchange/exchange.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NumberingModule } from '../numbering/numbering.module';
import { RatesModule } from '../rates/rates.module';
import { PurchasesService } from './purchases.service';
import { PurchaseSchema, Purchase, Supplier, SupplierLedger, SupplierLedgerSchema, SupplierSchema } from './supplier.schema';
import { PurchasesController, SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
      { name: SupplierLedger.name, schema: SupplierLedgerSchema },
      { name: Purchase.name, schema: PurchaseSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    BranchesModule, InventoryModule, NumberingModule, RatesModule, ExchangeModule,
  ],
  controllers: [SuppliersController, PurchasesController],
  providers: [SuppliersService, PurchasesService],
  exports: [SuppliersService, PurchasesService],
})
export class SuppliersModule {}
