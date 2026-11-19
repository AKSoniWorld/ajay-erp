import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rate, RateSchema } from './rate.schema';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Rate.name, schema: RateSchema }])],
  controllers: [RatesController],
  providers: [RatesService],
  exports: [RatesService],
})
export class RatesModule {}
