import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: true, trim: true, index: true }) name: string;
  @Prop({ required: true, unique: true }) mobile: string;
  @Prop() address?: string;
  @Prop() remarks?: string;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export const CustomerSchema = SchemaFactory.createForClass(Customer);
