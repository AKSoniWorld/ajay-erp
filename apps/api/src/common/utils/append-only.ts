import { Schema } from 'mongoose';

export function appendOnly(schema: Schema, name: string) {
  const block = function () { throw new Error(`${name} is append-only`); };
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
    'replaceOne', 'deleteOne', 'deleteMany'] as any, block as any);
  schema.pre('save', function () { if (!this.isNew) throw new Error(`${name} is append-only`); });
}
