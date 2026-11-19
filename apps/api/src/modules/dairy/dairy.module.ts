import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { Counter, CounterSchema } from '../catalog/counter.schema';
import { CustomersModule } from '../customers/customers.module';
import { CustomerLedger, CustomerLedgerSchema } from '../accounts/account.schema';
import { Invoice, InvoiceSchema } from '../pos/invoice.schema';
import { PrintModule } from '../print/print.module';
import { DairyController } from './dairy.controller';
import { DairyLedger, DairyLedgerSchema, DairyPayment, DairyPaymentSchema, DairyScheme, DairySchemeSchema } from './dairy.schema';
import { DairyService } from './dairy.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DairyScheme.name, schema: DairySchemeSchema },
      { name: DairyPayment.name, schema: DairyPaymentSchema },
      { name: DairyLedger.name, schema: DairyLedgerSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: CustomerLedger.name, schema: CustomerLedgerSchema },
    ]),
    BranchesModule, CustomersModule, PrintModule,
  ],
  controllers: [DairyController],
  providers: [DairyService],
  exports: [DairyService],
})
export class DairyModule {}
