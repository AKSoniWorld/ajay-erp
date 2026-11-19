import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

let app: INestApplication, mongod: MongoMemoryServer, audit: any;
let admin = '', staff = '', staffRefresh = '', branchA = '', branchB = '';
const http = () => request(app.getHttpServer());
const login = (mobile: string, password: string) => http().post('/api/v1/auth/login').send({ mobile, password });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongod.getUri('ajaytest'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { AuditLog } = await import('../src/modules/audit/audit.schema');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  audit = app.get(getModelToken(AuditLog.name));
});
afterAll(async () => { await app?.close(); await mongod?.stop(); });

describe('Phase 1 – foundation', () => {
  it('rejects wrong password and unauthenticated access', async () => {
    await login('9876543210', 'wrong-password').expect(401);
    await http().get('/api/v1/branches').expect(401);
  });

  it('admin logs in, creates two branches (audited)', async () => {
    const r = await login('9876543210', 'Admin@12345').expect(200);
    admin = r.body.accessToken;
    const a = await http().post('/api/v1/branches').set('Authorization', `Bearer ${admin}`)
      .send({ code: 'RNC1', name: 'Ranchi Main', invoicePrefix: 'RNC1' }).expect(201);
    const b = await http().post('/api/v1/branches').set('Authorization', `Bearer ${admin}`)
      .send({ code: 'RNC2', name: 'Ranchi Two', invoicePrefix: 'RNC2' }).expect(201);
    branchA = a.body._id; branchB = b.body._id;
    expect(await audit.countDocuments({ entity: 'Branches', action: 'POST create' })).toBe(2);
  });

  it('duplicate branch code is rejected', async () => {
    await http().post('/api/v1/branches').set('Authorization', `Bearer ${admin}`)
      .send({ code: 'rnc1', name: 'Dup', invoicePrefix: 'ZZ9' }).expect(409);
  });

  it('creates staff user; password never exposed or audited in clear', async () => {
    const r = await http().post('/api/v1/users').set('Authorization', `Bearer ${admin}`)
      .send({ name: 'Ravi', mobile: '9123456780', password: 'Staff@12345', role: 'STAFF', branchIds: [branchA] }).expect(201);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|Staff@12345/);
    const row = await audit.findOne({ entity: 'Users' }).lean();
    expect(JSON.stringify(row)).not.toContain('Staff@12345');
    const s = await login('9123456780', 'Staff@12345').expect(200);
    staff = s.body.accessToken; staffRefresh = s.body.refreshToken;
  });

  it('STAFF cannot reach admin routes', async () => {
    await http().get('/api/v1/users').set('Authorization', `Bearer ${staff}`).expect(403);
    await http().get('/api/v1/audit').set('Authorization', `Bearer ${staff}`).expect(403);
    await http().post('/api/v1/branches').set('Authorization', `Bearer ${staff}`)
      .send({ code: 'X1', name: 'x', invoicePrefix: 'X1' }).expect(403);
  });

  it('STAFF is isolated to own branch', async () => {
    const list = await http().get('/api/v1/branches').set('Authorization', `Bearer ${staff}`).expect(200);
    expect(list.body.map((b: any) => b._id)).toEqual([branchA]);
    await http().get(`/api/v1/branches/${branchA}`).set('Authorization', `Bearer ${staff}`).expect(200);
    await http().get(`/api/v1/branches/${branchB}`).set('Authorization', `Bearer ${staff}`).expect(403);
  });

  it('refresh tokens rotate and replay revokes the session', async () => {
    const r1 = await http().post('/api/v1/auth/refresh').send({ refreshToken: staffRefresh }).expect(200);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: staffRefresh }).expect(401); // replay
    await http().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401); // revoked
  });

  it('audit log is append-only', async () => {
    await expect(audit.updateOne({}, { action: 'tampered' })).rejects.toThrow('append-only');
    await expect(audit.deleteMany({})).rejects.toThrow('append-only');
  });

  it('deactivated user is locked out immediately', async () => {
    const list = await http().get('/api/v1/users').set('Authorization', `Bearer ${admin}`).expect(200);
    const ravi = list.body.items.find((u: any) => u.mobile === '9123456780');
    const s = await login('9123456780', 'Staff@12345').expect(200);
    await http().patch(`/api/v1/users/${ravi._id}`).set('Authorization', `Bearer ${admin}`).send({ active: false }).expect(200);
    await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${s.body.accessToken}`).expect(401);
  });
});
