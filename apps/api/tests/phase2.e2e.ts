import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { mkdtempSync } from 'fs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

let app: INestApplication, mongo: MongoMemoryReplSet, movementModel: any;
let admin = '', staff = '', owner = '';
let branchA = '', branchB = '', cat = '', sub = '', p1 = '', sku1 = '';
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const prod = (extra = {}) => ({
  name: '22K Gold Chain', categoryId: cat, subcategoryId: sub, metal: 'GOLD', karat: 22, purityPct: 91.6,
  grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM', makingValue: 50_000, ...extra,
});

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); // transactions need a replica set
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest2'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
    UPLOAD_DIR: mkdtempSync(join(tmpdir(), 'ajay-uploads-')),
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { StockMovement } = await import('../src/modules/inventory/stock.schema');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  movementModel = app.get(getModelToken(StockMovement.name));

  admin = (await http().post('/api/v1/auth/login').send({ mobile: '9876543210', password: 'Admin@12345' })).body.accessToken;
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1' })).body._id;
  branchB = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC2', name: 'Two', invoicePrefix: 'RNC2' })).body._id;
  await http().post('/api/v1/users').set(auth(admin))
    .send({ name: 'Ravi', mobile: '9123456780', password: 'Staff@12345', role: 'STAFF', branchIds: [branchA] });
  await http().post('/api/v1/users').set(auth(admin))
    .send({ name: 'Owner', mobile: '9123456781', password: 'Owner@12345', role: 'OWNER', branchIds: [branchA] });
  staff = (await http().post('/api/v1/auth/login').send({ mobile: '9123456780', password: 'Staff@12345' })).body.accessToken;
  owner = (await http().post('/api/v1/auth/login').send({ mobile: '9123456781', password: 'Owner@12345' })).body.accessToken;
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Phase 2 – catalog', () => {
  it('builds Category → Subcategory and rejects mismatched pairs', async () => {
    cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold Jewellery' }).expect(201)).body._id;
    sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat }).expect(201)).body._id;
    const other = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Silver' }).expect(201)).body._id;
    await http().post('/api/v1/products').set(auth(admin)).send(prod({ categoryId: other })).expect(400);
    await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'gold jewellery' }).expect(409); // case-insensitive unique
    const tree = await http().get('/api/v1/categories').set(auth(staff)).expect(200);
    expect(tree.body.find((c: any) => c._id === cat).children).toHaveLength(1);
  });

  it('auto-generates unique SKUs; rejects duplicates and bad weights', async () => {
    const a = await http().post('/api/v1/products').set(auth(admin)).send(prod()).expect(201);
    const b = await http().post('/api/v1/products').set(auth(admin)).send(prod({ name: 'Another' })).expect(201);
    p1 = a.body._id; sku1 = a.body.sku;
    expect(a.body.sku).toBe('G-000001'); expect(b.body.sku).toBe('G-000002');
    expect(a.body).not.toHaveProperty('barcode'); expect(a.body.qrPayload).toBe('AJ:G-000001');
    await http().post('/api/v1/products').set(auth(admin)).send(prod({ sku: 'g-000001' })).expect(409);
    await http().post('/api/v1/products').set(auth(admin)).send(prod({ netMg: 99_999 })).expect(400);
  });

  it('renders the QR code as PNG', async () => {
    for (const path of ['qr.png']) {
      const r = await http().get(`/api/v1/products/${p1}/${path}`).set(auth(staff)).expect(200);
      expect(r.headers['content-type']).toContain('image/png');
      expect(Buffer.from(r.body).subarray(1, 4).toString()).toBe('PNG');
    }
  });

  it('scanner lookup works for SKU and QR payload; SKU is immutable', async () => {
    await http().get(`/api/v1/products/by-code/${sku1}`).set(auth(staff)).expect(200);
    await http().get(`/api/v1/products/by-code/AJ:${sku1}`).set(auth(staff)).expect(200);
    const u = await http().patch(`/api/v1/products/${p1}`).set(auth(admin)).send({ name: 'Renamed' }).expect(200);
    expect(u.body.name).toBe('Renamed'); expect(u.body.sku).toBe(sku1);
    await http().patch(`/api/v1/products/${p1}`).set(auth(admin)).send({ sku: 'HACK-1' }).expect(200);
    expect((await http().get(`/api/v1/products/${p1}`).set(auth(admin))).body.sku).toBe(sku1);
  });

  it('STAFF can read but not write the catalog', async () => {
    await http().get('/api/v1/products').set(auth(staff)).expect(200);
    await http().post('/api/v1/products').set(auth(staff)).send(prod()).expect(403);
  });

  it('accepts real images only', async () => {
    const ok = await http().post(`/api/v1/products/${p1}/images`).set(auth(admin))
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(201);
    const url = ok.body.images[0];
    await http().get(url).expect(200); // public
    await http().post(`/api/v1/products/${p1}/images`).set(auth(admin))
      .attach('file', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' }).expect(400);
    await http().get('/api/v1/uploads/..%2f..%2fetc%2fpasswd').expect(400);
  });
});

describe('Phase 2 – inventory ledger', () => {
  it('stock changes only via movements; cannot go negative', async () => {
    await http().post('/api/v1/inventory/adjust').set(auth(admin))
      .send({ productId: p1, branchId: branchA, qty: 10, type: 'OPENING' }).expect(201);
    await http().post('/api/v1/inventory/adjust').set(auth(admin))
      .send({ productId: p1, branchId: branchA, qty: -3, note: 'damaged piece' }).expect(201);
    await http().post('/api/v1/inventory/adjust').set(auth(admin))
      .send({ productId: p1, branchId: branchA, qty: -50, note: 'too many' }).expect(400);
    await http().post('/api/v1/inventory/adjust').set(auth(admin))
      .send({ productId: p1, branchId: branchA, qty: -1 }).expect(400); // reason required

    const list = await http().get(`/api/v1/inventory?branchId=${branchA}`).set(auth(admin)).expect(200);
    expect(list.body.items[0].qty).toBe(7);
    const moves = await http().get(`/api/v1/inventory/movements?productId=${p1}`).set(auth(admin)).expect(200);
    expect(moves.body.items.map((m: any) => m.qty).reduce((a: number, b: number) => a + b, 0)).toBe(7);
    expect(moves.body.total).toBe(2); // failed attempts left no trace
  });

  it('product detail shows branch availability', async () => {
    const r = await http().get(`/api/v1/products/${p1}`).set(auth(admin)).expect(200);
    expect(r.body.availability).toEqual([{ branchId: branchA, qty: 7 }]);
    const list = await http().get(`/api/v1/products?branchId=${branchA}`).set(auth(admin)).expect(200);   // the list can carry stock for a branch
    expect(list.body.items.find((i: any) => i._id === p1).stockQty).toBe(7);
    expect(list.body.items.find((i: any) => i._id !== p1).stockQty).toBe(0);
  });

  it('enforces branch isolation and permissions', async () => {
    await http().post('/api/v1/inventory/adjust').set(auth(staff))
      .send({ productId: p1, branchId: branchA, qty: 1, type: 'OPENING' }).expect(403); // no inventory.write
    await http().post('/api/v1/inventory/adjust').set(auth(owner))
      .send({ productId: p1, branchId: branchB, qty: 1, type: 'OPENING' }).expect(403); // other branch
    await http().get(`/api/v1/inventory?branchId=${branchB}`).set(auth(staff)).expect(403);
    await http().post('/api/v1/inventory/adjust').set(auth(owner))
      .send({ productId: p1, branchId: branchA, qty: 5, type: 'OPENING' }).expect(201);
  });

  it('stock ledger is append-only', async () => {
    await expect(movementModel.updateOne({}, { qty: 999 })).rejects.toThrow('append-only');
    await expect(movementModel.deleteMany({})).rejects.toThrow('append-only');
  });
});
