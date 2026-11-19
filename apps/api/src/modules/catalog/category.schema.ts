import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** One collection for both levels: parentId = null → Category, otherwise → Subcategory. */
@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ type: Types.ObjectId, default: null }) parentId: Types.ObjectId | null;
  @Prop({ default: 0 }) order: number;
  @Prop({ default: true }) active: boolean;
}
export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ parentId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
