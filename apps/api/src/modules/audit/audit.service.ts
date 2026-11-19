import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from './audit.schema';

const SENSITIVE = /password|token|hash|secret/i;
export function redact(v: any): any {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, SENSITIVE.test(k) ? '[REDACTED]' : redact(val)]));
  return v;
}

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private model: Model<AuditLog>) {}
  log(entry: Partial<AuditLog>) { return this.model.create({ ...entry, before: redact(entry.before), after: redact(entry.after) }); }
  async list(f: { entity?: string; actorId?: string; from?: Date; to?: Date; page: number; limit: number }) {
    const q: Record<string, any> = {};
    if (f.entity) q.entity = f.entity;
    if (f.actorId) q.actorId = f.actorId;
    if (f.from || f.to) q.at = { ...(f.from && { $gte: f.from }), ...(f.to && { $lte: f.to }) };
    const [items, total] = await Promise.all([
      this.model.find(q).sort({ at: -1 }).skip((f.page - 1) * f.limit).limit(f.limit).lean(),
      this.model.countDocuments(q),
    ]);
    return { items, total, page: f.page, limit: f.limit };
  }
}
