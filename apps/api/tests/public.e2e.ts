import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

let app: INestApplication, mongo: MongoMemoryReplSet;
let admin = '', branchA = '', branchB = '', chain = '', plate = '', hidden = '', chainSku = '', cat = '', sub = '';
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const pub = (path: string) => http().get(`/api/v1/public${path}`);              // NO Authorization header

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest13'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000', PUBLIC_WHATSAPP_DEFAULT: '919000000000',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();

  admin = (await http().post('/api/v1/auth/login').send({ mobile: '9876543210', password: 'Admin@12345' })).body.accessToken;
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1', address: 'Main Road, Ranchi',
    gstin: '20ABCDE1234F1Z5', whatsappNumber: '9876501234' })).body._id;
  branchB = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC2', name: 'Second', invoicePrefix: 'RNC2' })).body._id;
  cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold Jewellery' })).body._id;
  sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  const mk = async (b: any) => (await http().post('/api/v1/products').set(auth(admin)).send({ categoryId: cat, subcategoryId: sub, makingType: 'PER_GRAM', makingValue: 50_000, stoneValuePaise: 123_400, ...b })).body;
  const c = await mk({ name: 'Gold Chain', metal: 'GOLD', karat: 22, grossMg: 10_500, netMg: 10_000 });
  chain = c._id; chainSku = c.sku;
  plate = (await mk({ name: 'Silver Plate', metal: 'SILVER', purityPct: 92.5, grossMg: 50_000, netMg: 50_000 }))._id;
  hidden = (await mk({ name: 'Hidden Ring', metal: 'GOLD', karat: 18, grossMg: 3_000, netMg: 3_000 }))._id;
  await http().patch(`/api/v1/products/${hidden}`).set(auth(admin)).send({ active: false });
  const stockIn = (productId: string, branchId: string, qty: number) =>
    http().post('/api/v1/inventory/adjust').set(auth(admin)).send({ productId, branchId, qty, type: 'OPENING' });
  await stockIn(chain, branchA, 3); await stockIn(plate, branchB, 1); await stockIn(hidden, branchA, 2);
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Public catalog (no login)', () => {
  it('lists active products without any internal data', async () => {
    const r = (await pub('/products').expect(200)).body;
    expect(r.items.map((i: any) => i.name).sort()).toEqual(['Gold Chain', 'Silver Plate']);          // the inactive piece is hidden
    for (const i of r.items) for (const k of ['makingType', 'makingValue', 'stoneValuePaise', 'createdBy', 'barcode', 'qrPayload', 'hsn', 'qty', 'price'])
      expect(i).not.toHaveProperty(k);
    const c = r.items.find((i: any) => i.sku === chainSku);
    expect(c).toMatchObject({ metal: 'GOLD', karat: 22, grossMg: 10_500, category: 'Gold Jewellery', subcategory: 'Chains' });
  });
  it('shows which branches have it, with a WhatsApp enquiry that names the piece', async () => {
    const c = (await pub(`/products/${chainSku}`).expect(200)).body;
    expect(c.availability).toHaveLength(1);
    expect(c.availability[0]).toMatchObject({ branch: 'Main', address: 'Main Road, Ranchi', inStock: true });
    expect(c.availability[0]).not.toHaveProperty('qty');
    expect(c.availability[0].whatsapp).toBe(`https://wa.me/919876501234?text=${encodeURIComponent(`Hi, I'm interested in Gold Chain (SKU ${chainSku}) at Main`)}`);
    expect(c.enquiry).toContain('https://wa.me/919000000000?text=');                                 // shop-wide number
    const p = (await pub('/products?q=plate').expect(200)).body.items[0];
    expect(p.availability[0].whatsapp).toContain('919000000000');                                    // branch without its own number → default
  });
  it('filters by branch, metal, stock and search', async () => {
    expect((await pub(`/products?branchId=${branchA}`)).body.items.map((i: any) => i.name)).toEqual(['Gold Chain']);
    expect((await pub(`/products?branchId=${branchB}`)).body.items.map((i: any) => i.name)).toEqual(['Silver Plate']);
    expect((await pub('/products?metal=SILVER')).body.total).toBe(1);
    expect((await pub('/products?inStock=true')).body.total).toBe(2);
    expect((await pub('/products?q=chain')).body.items).toHaveLength(1);
    expect((await pub(`/products?subcategoryId=${sub}`)).body.total).toBe(2);
    expect((await pub('/products?limit=1')).body).toMatchObject({ total: 2, limit: 1 });
    await pub('/products?limit=500').expect(400);                                                   // page size is capped
  });
  it('404 for unknown or hidden pieces; categories and shops are listed', async () => {
    await pub('/products/NOPE-1').expect(404);
    const hiddenSku = (await http().get(`/api/v1/products/${hidden}`).set(auth(admin))).body.sku;
    await pub(`/products/${hiddenSku}`).expect(404);
    expect((await pub('/categories').expect(200)).body[0]).toMatchObject({ name: 'Gold Jewellery', children: [{ name: 'Chains' }] });
    const b = (await pub('/branches').expect(200)).body;
    expect(b.map((x: any) => x.name)).toEqual(['Main', 'Second']);
    for (const x of b) for (const k of ['gstin', 'printer', 'invoicePrefix', 'invoiceSeq', 'createdBy']) expect(x).not.toHaveProperty(k);
    expect(b[0].whatsapp).toBe('https://wa.me/919876501234');
  });
  it('is read-only and the health check reports the database', async () => {
    await http().post('/api/v1/public/products').send({}).expect(404);
    expect((await http().get('/health').expect(200)).body).toMatchObject({ status: 'ok', db: 'up' });
  });
});
