import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerAccount, CustomerAccountSchema, CustomerLedger, CustomerLedgerSchema } from '../accounts/account.schema';
import { Branch, BranchSchema } from '../branches/branch.schema';
import { Product, ProductSchema } from '../catalog/product.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { DairyLedger, DairyLedgerSchema, DairyPayment, DairyPaymentSchema, DairyScheme, DairySchemeSchema } from '../dairy/dairy.schema';
import { Exchange, ExchangeSchema } from '../exchange/exchange.schema';
import { RawStock, RawStockSchema } from '../exchange/raw.schema';
import { BranchStock, BranchStockSchema, StockMovement, StockMovementSchema } from '../inventory/stock.schema';
import { Invoice, InvoiceSchema } from '../pos/invoice.schema';
import { PrintModule } from '../print/print.module';
import { Supplier, SupplierLedger, SupplierLedgerSchema, SupplierSchema } from '../suppliers/supplier.schema';
import { Transfer, TransferSchema } from '../transfers/transfer.schema';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invoice.name, schema: InvoiceSchema }, { name: Exchange.name, schema: ExchangeSchema },
      { name: StockMovement.name, schema: StockMovementSchema }, { name: BranchStock.name, schema: BranchStockSchema },
      { name: RawStock.name, schema: RawStockSchema }, { name: DairyPayment.name, schema: DairyPaymentSchema },
      { name: DairyScheme.name, schema: DairySchemeSchema }, { name: DairyLedger.name, schema: DairyLedgerSchema },
      { name: CustomerLedger.name, schema: CustomerLedgerSchema }, { name: CustomerAccount.name, schema: CustomerAccountSchema },
      { name: Customer.name, schema: CustomerSchema }, { name: Supplier.name, schema: SupplierSchema },
      { name: SupplierLedger.name, schema: SupplierLedgerSchema }, { name: Product.name, schema: ProductSchema },
      { name: Branch.name, schema: BranchSchema }, { name: Transfer.name, schema: TransferSchema },
    ]),
    PrintModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, DashboardService],
})
export class ReportsModule {}
