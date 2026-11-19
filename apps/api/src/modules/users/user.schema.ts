import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { Role } from '@ajay/shared';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, unique: true }) mobile: string;
  @Prop({ required: true, select: false }) passwordHash: string;
  @Prop({ required: true, enum: ['ADMIN', 'OWNER', 'STAFF'] }) role: Role;
  @Prop({ type: [Types.ObjectId], default: [] }) branchIds: Types.ObjectId[];
  @Prop({ default: true }) active: boolean;
  @Prop() lastLoginAt?: Date;
  @Prop({ type: [{ hash: String, expiresAt: Date, _id: false }], default: [], select: false })
  refreshTokens: { hash: string; expiresAt: Date }[];
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
}
export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.set('toJSON', {
  transform: (_doc, ret: any) => { delete ret.passwordHash; delete ret.refreshTokens; delete ret.__v; return ret; },
});
