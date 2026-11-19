import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { CatalogModule } from '../catalog/catalog.module';
import { Counter, CounterSchema } from '../catalog/counter.schema';
import { Product, ProductSchema } from '../catalog/product.schema';
import { CustomersModule } from '../customers/customers.module';
import { AccountsModule } from '../accounts/accounts.module';
import { PrintModule } from '../print/print.module';
import { DairyModule } from '../dairy/dairy.module';
import { ExchangeModule } from '../exchange/exchange.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RatesModule } from '../rates/rates.module';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    BranchesModule, CatalogModule, CustomersModule, InventoryModule, RatesModule, ExchangeModule, DairyModule, AccountsModule, PrintModule,
  ],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
