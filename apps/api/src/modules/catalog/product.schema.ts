import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, trim: true, index: true }) name: string;
  @Prop({ required: true, trim: true }) shortName: string; // printed on tags
  @Prop({ required: true, unique: true, uppercase: true, trim: true }) sku: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) categoryId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) subcategoryId: Types.ObjectId;
  @Prop({ required: true, enum: ['GOLD', 'SILVER', 'DIAMOND'] }) metal: 'GOLD' | 'SILVER' | 'DIAMOND';
  @Prop({ type: Number, enum: [24, 22, 18] }) karat?: number; // GOLD only — selects the 22K / 18K rate
  @Prop({ required: true }) purityPct: number;      // informational (tags/invoice); NOT used in pricing
  @Prop({ required: true }) grossMg: number;        // integer milligrams
  @Prop({ required: true }) netMg: number;          // metal weight (≤ gross)
  /** PER_GRAM: paise per gram · FLAT: paise · PERCENT: basis points (1250 = 12.5%) */
  @Prop({ required: true, enum: ['PER_GRAM', 'FLAT', 'PERCENT'] }) makingType: 'PER_GRAM' | 'FLAT' | 'PERCENT';
  @Prop({ required: true, default: 0 }) makingValue: number;
  @Prop({ default: 0 }) stoneValuePaise: number;   // diamonds/stones, added to jewellery value as-is
  @Prop({ default: '7113' }) hsn: string;
  @Prop({ type: [String], default: [] }) images: string[];
  @Prop({ required: true }) qrPayload: string;      // "AJ:<SKU>"
  @Prop({ default: true }) active: boolean;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);
