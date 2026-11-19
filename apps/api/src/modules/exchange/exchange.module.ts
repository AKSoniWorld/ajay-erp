import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { RatesModule } from '../rates/rates.module';
import { ExchangeController, RawInventoryController } from './exchange.controller';
import { Exchange, ExchangeSchema } from './exchange.schema';
import { ExchangeService } from './exchange.service';
import { RawInventoryService } from './raw-inventory.service';
import { RawMovement, RawMovementSchema, RawStock, RawStockSchema } from './raw.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Exchange.name, schema: ExchangeSchema },
      { name: RawStock.name, schema: RawStockSchema },
      { name: RawMovement.name, schema: RawMovementSchema },
    ]),
    BranchesModule, RatesModule,
  ],
  controllers: [ExchangeController, RawInventoryController],
  providers: [ExchangeService, RawInventoryService],
  exports: [ExchangeService, RawInventoryService],
})
export class ExchangeModule {}
