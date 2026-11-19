import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchesModule } from '../branches/branches.module';
import { Counter, CounterSchema } from '../catalog/counter.schema';
import { NumberingService } from './numbering.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Counter.name, schema: CounterSchema }]), BranchesModule],
  providers: [NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}
