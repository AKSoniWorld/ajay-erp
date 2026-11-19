import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false })
export class AuditLog {
  @Prop() actorId?: string;
  @Prop() role?: string;
  @Prop() branchId?: string;
  @Prop({ required: true, index: true }) action: string;
  @Prop({ required: true, index: true }) entity: string;
  @Prop({ index: true }) entityId?: string;
  @Prop({ type: Object }) before?: unknown;
  @Prop({ type: Object }) after?: unknown;
  @Prop() ip?: string;
}
export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Append-only: block every update/delete path.
const block = function () { throw new Error('AuditLog is append-only'); };
AuditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
    'replaceOne', 'deleteOne', 'deleteMany'] as any, block as any);
AuditLogSchema.pre('save', function () {
  if (!this.isNew) throw new Error('AuditLog is append-only');
});
