import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { Counter, CounterSchema } from '../catalog/counter.schema';
import { CustomersModule } from '../customers/customers.module';
import { DairyModule } from '../dairy/dairy.module';
import { Exchange, ExchangeSchema } from '../exchange/exchange.schema';
import { Invoice, InvoiceSchema } from '../pos/invoice.schema';
import { CustomerAccount, CustomerAccountSchema, CustomerLedger, CustomerLedgerSchema } from './account.schema';
import { PrintModule } from '../print/print.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerAccount.name, schema: CustomerAccountSchema },
      { name: CustomerLedger.name, schema: CustomerLedgerSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Exchange.name, schema: ExchangeSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    BranchesModule, CustomersModule, DairyModule, PrintModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
