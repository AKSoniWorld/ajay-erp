import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import request from 'supertest';

let app: INestApplication, mongo: MongoMemoryReplSet, invoiceModel: any;
let admin = '', owner = '', staff = '', staff2 = '';
let branchA = '', branchB = '', chain = '', sku = '', anita = '', finalId = '', finalNo = '', draftId = '';
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (m: string, p: string) => (await http().post('/api/v1/auth/login').send({ mobile: m, password: p })).body.accessToken as string;
const binary = (res: any, cb: any) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); };
const getPdf = (path: string, t: string) => http().get(path).set(auth(t)).buffer(true).parse(binary);
const isPdf = (r: any) => { expect(r.headers['content-type']).toContain('application/pdf'); expect(Buffer.from(r.body).subarray(0, 5).toString()).toBe('%PDF-'); };
const decode = (r: any) => Buffer.from(r.body.bytesBase64, 'base64');
const tags = (t: string, extra: any = {}) => http().post('/api/v1/print/tags').set(auth(t))
  .send({ branchId: branchA, items: [{ productId: chain, copies: 3 }], ...extra });

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest7'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
    PDF_FONT_DIR: '/nonexistent', // forces the built-in font so the test needs no font files
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { Invoice } = await import('../src/modules/pos/invoice.schema');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  invoiceModel = app.get(getModelToken(Invoice.name));

  admin = await login('9876543210', 'Admin@12345');
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Ajay Jewellers Main', invoicePrefix: 'RNC1',
    gstin: '20ABCDE1234F1Z5', address: 'Main Road, Ranchi', state: 'Jharkhand', printer: { tagSize: '40x25', connection: 'usb', language: 'ESCPOS' } })).body._id;
  branchB = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC2', name: 'Two', invoicePrefix: 'RNC2' })).body._id;
  const mk = (n: string, m: string, p: string, r: string) =>
    http().post('/api/v1/users').set(auth(admin)).send({ name: n, mobile: m, password: p, role: r, branchIds: [branchA] });
  await mk('Owner', '9123456781', 'Owner@12345', 'OWNER'); await mk('Ravi', '9123456780', 'Staff@12345', 'STAFF'); await mk('Sita', '9123456782', 'Staff@12345', 'STAFF');
  owner = await login('9123456781', 'Owner@12345'); staff = await login('9123456780', 'Staff@12345'); staff2 = await login('9123456782', 'Staff@12345');
  const cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold' })).body._id;
  const sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  const p = (await http().post('/api/v1/products').set(auth(admin)).send({ name: 'Gold Chain', categoryId: cat, subcategoryId: sub,
    metal: 'GOLD', karat: 22, grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM', makingValue: 50_000 })).body;
  chain = p._id; sku = p.sku;
  await http().post('/api/v1/inventory/adjust').set(auth(admin)).send({ productId: chain, branchId: branchA, qty: 10, type: 'OPENING' });
  await http().post('/api/v1/rates').set(auth(admin)).send({ metal: 'GOLD', karat: 22, kind: 'SALE', ratePerGramPaise: 700_000, reason: 'test rate' });
  anita = (await http().post('/api/v1/customers').set(auth(staff)).send({ name: 'Anita', mobile: '9000000001' })).body._id;
  finalId = (await http().post('/api/v1/pos/invoices').set(auth(staff)).send({ branchId: branchA, customerId: anita, lines: [{ productId: chain }] })).body._id;
  const f = await http().post(`/api/v1/pos/invoices/${finalId}/finalize`).set(auth(staff)).send({ payments: [{ mode: 'UPI', amountPaise: 7_725_000 }] });
  finalNo = f.body.number;
  draftId = (await http().post('/api/v1/pos/invoices').set(auth(staff)).send({ branchId: branchA, customerId: anita, lines: [{ productId: chain }] })).body._id;
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Phase 6 – A4 invoice PDF', () => {
  it('renders a finalized invoice (inline by default, attachment on request)', async () => {
    const r = await getPdf(`/api/v1/pos/invoices/${finalId}/pdf`, staff).expect(200);
    isPdf(r);
    expect(r.headers['content-disposition']).toBe(`inline; filename="${finalNo}.pdf"`);
    expect(r.body.length).toBeGreaterThan(1500);
    const d = await getPdf(`/api/v1/pos/invoices/${finalId}/pdf?download=1`, staff).expect(200);
    expect(d.headers['content-disposition']).toContain('attachment');
  });
  it('renders drafts as DRAFT previews', async () => {
    const r = await getPdf(`/api/v1/pos/invoices/${draftId}/pdf`, staff).expect(200);
    isPdf(r); expect(r.headers['content-disposition']).toContain(`DRAFT-${draftId}`);
  });
  it('respects who may see the bill', async () => {
    await getPdf(`/api/v1/pos/invoices/${finalId}/pdf`, staff2).expect(404);
    await getPdf(`/api/v1/pos/invoices/${finalId}/pdf`, owner).expect(200);
  });
});

describe('Phase 6 – receipts', () => {
  it('prints dairy, advance and due receipts', async () => {
    const scheme = (await http().post('/api/v1/dairy/schemes').set(auth(owner)).send({ customerId: anita, branchId: branchA,
      startDate: new Date().toISOString(), monthlyPaise: 100_000, durationMonths: 11, type: 'BONUS' }).expect(201)).body._id;
    const dr = (await http().post(`/api/v1/dairy/schemes/${scheme}/payments`).set(auth(staff)).send({ amountPaise: 100_000, mode: 'UPI' }).expect(201)).body.receiptNo;
    isPdf(await getPdf(`/api/v1/dairy/receipts/${dr}/pdf`, staff).expect(200));
    const ar = (await http().post(`/api/v1/customers/${anita}/advance`).set(auth(staff)).send({ branchId: branchA, amountPaise: 500_000, mode: 'UPI' }).expect(201)).body.receiptNo;
    isPdf(await getPdf(`/api/v1/customers/${anita}/receipts/${ar}/pdf`, staff).expect(200));
    await getPdf(`/api/v1/customers/${anita}/receipts/NOPE-1/pdf`, staff).expect(404);
  });
});

describe('Phase 6 – thermal tags', () => {
  it('ESC/POS bytes by default (branch setting): 3 copies, QR only (no barcode), label content', async () => {
    const r = await tags(staff).expect(200);
    expect(r.body).toMatchObject({ language: 'ESCPOS', tagSize: '40x25', count: 3 });
    expect(r.body.labels[0]).toMatchObject({ sku, grade: '22K', gross: '10.500', net: '10.000', branchName: 'Ajay Jewellers Main', qr: `AJ:${sku}` });
    const b = decode(r);
    expect(b.toString('latin1').split('\x1b@').length - 1).toBe(3);
    expect(b.includes(Buffer.from([0x1d, 0x6b]))).toBe(false);                      // no barcode command
    expect(b.includes(Buffer.from(`AJ:${sku}`, 'latin1'))).toBe(true);
  });
  it('language can be overridden per request (TSPL)', async () => {
    const r = await tags(staff, { language: 'TSPL', items: [{ productId: chain, copies: 2 }] }).expect(200);
    const t = decode(r).toString('latin1');
    expect(t).toContain('SIZE 40 mm,25 mm'); expect(t).toContain('PRINT 1,2'); expect(t).toContain(`"${sku}"`);
  });
  it('follows the branch printer setting once the admin changes it', async () => {
    await http().patch(`/api/v1/branches/${branchA}`).set(auth(admin)).send({ printer: { tagSize: '50x25', connection: 'bluetooth', language: 'TSPL' } }).expect(200);
    const r = await tags(staff).expect(200);
    expect(r.body).toMatchObject({ language: 'TSPL', tagSize: '50x25' });
    expect(decode(r).toString('latin1')).toContain('SIZE 50 mm,25 mm');
  });
  it('test label, branch isolation and bad input', async () => {
    expect((await http().post('/api/v1/print/tags/test').set(auth(staff)).send({ branchId: branchA }).expect(200)).body.labels[0].sku).toBe('TEST-000001');
    await tags(staff, { branchId: branchB }).expect(403);
    await tags(staff, { items: [{ productId: new Types.ObjectId().toString() }] }).expect(400);
    await tags(staff, { items: [] }).expect(400);
  });
});

describe('Phase 6 – integrity', () => {
  it('refuses to print an invoice whose stored data no longer matches its hash', async () => {
    await invoiceModel.collection.updateOne({ _id: new Types.ObjectId(finalId) }, { $set: { 'totals.finalPayable': 1 } }); // bypasses the model lock
    const r = await getPdf(`/api/v1/pos/invoices/${finalId}/pdf`, owner).expect(409);
    expect(Buffer.from(r.body).toString()).toMatch(/integrity check failed/);
  });
});
