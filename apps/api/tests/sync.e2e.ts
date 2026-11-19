import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { financialYearCode } from '../src/engines/numbering';

let app: INestApplication, mongo: MongoMemoryReplSet;
let admin = '', ownerA = '', staffA = '', staffB = '';
let branchA = '', branchB = '', chain = '', anita = '', scheme = '';
let n = 0, firstUuid = '';
const fy = financialYearCode();
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (m: string, p: string) => (await http().post('/api/v1/auth/login').send({ mobile: m, password: p })).body.accessToken as string;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const push = (t: string, ops: any[], deviceId = 'dev-1') => http().post('/api/v1/sync/push').set(auth(t)).send({ deviceId, ops });
const sale = (extra: any = {}, uuid = randomUUID()) => ({ clientUuid: uuid, type: 'SALE', payload: {
  branchId: branchA, customerId: anita, lines: [{ productId: chain }], payments: [{ mode: 'UPI', amountPaise: 7_725_000 }],
  clientTotals: { finalPayable: 7_725_000 }, offlineAt: new Date(Date.now() - 60_000).toISOString(), provisionalNo: `OFF-D1-${++n}`, ...extra } });
const stockQty = async () => (await http().get(`/api/v1/inventory?branchId=${branchA}`).set(auth(admin))).body.items.find((i: any) => String(i.productId) === chain)?.qty ?? 0;
const invoice = async (id: string) => (await http().get(`/api/v1/pos/invoices/${id}`).set(auth(ownerA)).expect(200)).body;
const setRate = (r: number) => http().post('/api/v1/rates').set(auth(admin)).send({ metal: 'GOLD', karat: 22, kind: 'SALE', ratePerGramPaise: r, reason: 'test rate' }).expect(201);
const one = async (t: string, ops: any[]) => (await push(t, ops).expect(200)).body.results[0];
// 22K chain, 10 g net @ ₹7,000 + ₹5,000 making + 3% GST = ₹77,250 (₹80,855 at ₹7,350/g)

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest12'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();

  admin = await login('9876543210', 'Admin@12345');
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1', gstin: '20ABCDE1234F1Z5' })).body._id;
  branchB = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC2', name: 'Two', invoicePrefix: 'RNC2' })).body._id;
  const mk = (nm: string, m: string, r: string, b: string) => http().post('/api/v1/users').set(auth(admin)).send({ name: nm, mobile: m, password: 'Pass@12345', role: r, branchIds: [b] });
  await mk('Owner A', '9123456781', 'OWNER', branchA); await mk('Staff A', '9123456780', 'STAFF', branchA); await mk('Staff B', '9123456782', 'STAFF', branchB);
  ownerA = await login('9123456781', 'Pass@12345'); staffA = await login('9123456780', 'Pass@12345'); staffB = await login('9123456782', 'Pass@12345');
  const cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold' })).body._id;
  const sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  chain = (await http().post('/api/v1/products').set(auth(admin)).send({ name: 'Gold Chain', categoryId: cat, subcategoryId: sub,
    metal: 'GOLD', karat: 22, grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM', makingValue: 50_000 })).body._id;
  await http().post('/api/v1/inventory/adjust').set(auth(admin)).send({ productId: chain, branchId: branchA, qty: 5, type: 'OPENING' });
  await http().post('/api/v1/rates').set(auth(admin)).send({ metal: 'GOLD', karat: 22, kind: 'SALE', ratePerGramPaise: 700_000, reason: 'test rate' });
  anita = (await http().post('/api/v1/customers').set(auth(staffA)).send({ name: 'Anita', mobile: '9000000001' })).body._id;
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Pull – incremental download of master data', () => {
  const pull = (c: string, q = '', t = staffA) => http().get(`/api/v1/sync/pull/${c}?${q}`).set(auth(t));
  it('downloads products, categories, customers, rates, stock', async () => {
    const p = (await pull('products').expect(200)).body;
    expect(p.items.map((i: any) => i._id)).toContain(chain); expect(p.hasMore).toBe(false);
    expect((await pull('categories').expect(200)).body.items.length).toBeGreaterThan(0);
    expect((await pull('customers').expect(200)).body.items.map((c: any) => c.name)).toContain('Anita');
    expect((await pull('rates').expect(200)).body.items[0].GOLD_22K.SALE.ratePerGramPaise).toBe(700_000);
    const s = (await pull('stock', `branchId=${branchA}`).expect(200)).body;
    expect(s.items).toHaveLength(1); expect(s.items[0].qty).toBe(5);
  });
  it('then only what changed, and pages through big sets', async () => {
    const first = (await pull('products').expect(200)).body;
    const sku = (await http().post('/api/v1/products').set(auth(admin)).send({ name: 'Silver Plate', categoryId: (await http().get('/api/v1/categories').set(auth(admin))).body[0]._id,
      subcategoryId: (await http().get('/api/v1/categories').set(auth(admin))).body[0].children[0]._id, metal: 'SILVER', purityPct: 92.5, grossMg: 5000, netMg: 5000,
      makingType: 'FLAT', makingValue: 0 })).body.sku;
    const next = (await pull('products', `since=${encodeURIComponent(first.nextSince)}`).expect(200)).body;
    expect(next.items.map((i: any) => i.sku)).toContain(sku);
    const paged = (await pull('products', 'limit=1').expect(200)).body;
    expect(paged.items).toHaveLength(1); expect(paged.hasMore).toBe(true);
  });
  it('rejects unknown collections, missing branch and other branches', async () => {
    await pull('nope').expect(400);
    await pull('stock').expect(400);
    await pull('stock', `branchId=${branchA}`, staffB).expect(403);
  });
});

describe('Push – offline sales', () => {
  it('applies a sale: official number issued, back-dated to when it happened, provisional number kept', async () => {
    const op = sale(); firstUuid = op.clientUuid;
    const before = await stockQty();
    const r = await one(staffA, [op]);
    expect(r).toMatchObject({ status: 'APPLIED', provisionalNo: op.payload.provisionalNo, invoiceNumber: `RNC1-${fy}-000001`, negativeStock: false });
    const inv = await invoice(r.invoiceId);
    expect(inv).toMatchObject({ status: 'FINAL', locked: true, offline: true, provisionalNo: op.payload.provisionalNo, deviceId: 'dev-1' });
    expect(new Date(inv.finalizedAt).getTime()).toBe(new Date(op.payload.offlineAt as string).getTime());
    expect(await stockQty()).toBe(before - 1);
  });
  it('replaying the same operation does nothing twice', async () => {
    const before = await stockQty();
    const again = await one(staffA, [{ clientUuid: firstUuid, type: 'SALE', payload: { ignored: true } }]);
    expect(again).toMatchObject({ status: 'APPLIED', invoiceNumber: `RNC1-${fy}-000001` });
    expect(await stockQty()).toBe(before);
    expect((await http().get('/api/v1/pos/invoices?status=FINAL&type=SALE').set(auth(ownerA))).body.total).toBe(1);
    expect((await one(ownerA, [{ clientUuid: firstUuid, type: 'SALE', payload: {} }])).error).toMatch(/another user/);
  });
  it('a customer created offline is matched by mobile, never duplicated', async () => {
    const mk = (name: string) => sale({ customerId: undefined, customer: { name, mobile: '9222222222' } });
    expect((await one(staffA, [mk('Ravi')])).status).toBe('APPLIED');
    expect((await one(staffA, [mk('Someone Else')])).status).toBe('APPLIED');
    const list = (await http().get('/api/v1/customers?q=9222222222').set(auth(staffA))).body;
    expect(list.total).toBe(1); expect(list.items[0].name).toBe('Ravi');             // the existing record wins
  });
  it('a price that differs from what the customer was charged goes to review (draft kept, stock untouched)', async () => {
    const before = await stockQty();
    const r = await one(staffA, [sale({ clientTotals: { finalPayable: 7_000_000 } })]);
    expect(r.status).toBe('NEEDS_REVIEW'); expect(r.error).toMatch(/Price differs/);
    expect((await invoice(r.invoiceId)).status).toBe('DRAFT');
    expect(await stockQty()).toBe(before);
    const q = (await http().get('/api/v1/sync/ops').set(auth(ownerA)).expect(200)).body;
    expect(q.items.map((o: any) => o.result?.invoiceId)).toContain(r.invoiceId);
    await http().get('/api/v1/sync/ops').set(auth(staffA)).expect(403);
    // the owner finishes it by hand, then closes the review item
    await http().post(`/api/v1/pos/invoices/${r.invoiceId}/finalize`).set(auth(ownerA)).send({ payments: [{ mode: 'UPI', amountPaise: 7_725_000 }] }).expect(200);
    const op = q.items.find((o: any) => o.result?.invoiceId === r.invoiceId);
    expect((await http().post(`/api/v1/sync/ops/${op._id}/resolve`).set(auth(ownerA)).send({ note: 'finalized manually' }).expect(200)).body.status).toBe('RESOLVED');
    expect((await http().get('/api/v1/sync/ops').set(auth(ownerA))).body.items.map((o: any) => o._id)).not.toContain(op._id);
  });
  it('prices with the rates of the moment the sale was made, not today\'s', async () => {
    const tBefore = new Date(); await sleep(60);
    await setRate(735_000);                                                            // rate moves up after the sale
    const old = await one(staffA, [sale({ offlineAt: tBefore.toISOString() })]);        // charged ₹77,250 at the old rate → matches
    expect(old).toMatchObject({ status: 'APPLIED' });
    const wrong = await one(staffA, [sale({ offlineAt: new Date().toISOString() })]);   // after the change, but charged the old price
    expect(wrong.status).toBe('NEEDS_REVIEW'); expect(wrong.error).toContain('8085500');
    const right = await one(staffA, [sale({ offlineAt: new Date().toISOString(), clientTotals: { finalPayable: 8_085_500 }, payments: [{ mode: 'UPI', amountPaise: 8_085_500 }] })]);
    expect(right.status).toBe('APPLIED');
    await setRate(700_000);
  });
  it('overselling is allowed and flagged, never lost', async () => {
    const q = await stockQty(); if (q > 0) await http().post('/api/v1/inventory/adjust').set(auth(admin)).send({ productId: chain, branchId: branchA, qty: -q, note: 'zero for test' }).expect(201);
    const r = await one(staffA, [sale()]);
    expect(r).toMatchObject({ status: 'APPLIED', negativeStock: true });
    expect((await invoice(r.invoiceId)).negativeStock).toBe(true);
    expect(await stockQty()).toBe(-1);
  });
  it('implausible dates fail; the same operation can be corrected and re-sent', async () => {
    const uuid = randomUUID();
    const bad = await one(staffA, [sale({ offlineAt: new Date(Date.now() + 3_600_000).toISOString() }, uuid)]);
    expect(bad.status).toBe('FAILED'); expect(bad.error).toMatch(/future/);
    expect((await one(staffA, [sale({ offlineAt: new Date(Date.now() - 40 * 86_400_000).toISOString() })])).error).toMatch(/older than 30 days/);
    expect((await one(staffA, [sale({}, uuid)])).status).toBe('APPLIED');                // retry of a FAILED operation
  });
  it('validates the payload strictly and respects branches', async () => {
    expect((await one(staffA, [sale({ taxMode: 'NON_GST' })])).error).toMatch(/taxMode should not exist/);   // the client cannot choose GST mode
    expect((await one(staffA, [sale({ lines: undefined })])).status).toBe('FAILED');
    expect((await one(staffB, [sale()])).error).toMatch(/Branch access denied/);
    await http().post('/api/v1/sync/push').send({ deviceId: 'd', ops: [] }).expect(401);
  });
});

describe('Push – dairy and batches', () => {
  it('collects a dairy payment exactly once', async () => {
    scheme = (await http().post('/api/v1/dairy/schemes').set(auth(ownerA)).send({ customerId: anita, branchId: branchA,
      startDate: new Date().toISOString(), monthlyPaise: 100_000, durationMonths: 11, type: 'BONUS' }).expect(201)).body._id;
    const op = { clientUuid: randomUUID(), type: 'DAIRY_PAYMENT', payload: { schemeId: scheme, amountPaise: 100_000, mode: 'UPI' } };
    const a = await one(staffA, [op]), b = await one(staffA, [op]);
    expect(a).toMatchObject({ status: 'APPLIED', receiptNo: `RNC1-DR-${fy}-000001` });
    expect(b.receiptNo).toBe(a.receiptNo);
    expect((await http().get(`/api/v1/dairy/schemes/${scheme}`).set(auth(staffA))).body.paidPaise).toBe(100_000);
  });
  it('a sale that cannot use the dairy balance fails cleanly', async () => {
    const r = await one(staffA, [sale({ dairy: [{ schemeId: scheme, amountPaise: 5_000_000 }] })]);
    expect(r.status).toBe('FAILED'); expect(r.error).toMatch(/bonus|balance/);
  });
  it('a batch is processed in order and one bad operation does not stop the rest', async () => {
    const dairy = { clientUuid: randomUUID(), type: 'DAIRY_PAYMENT', payload: { schemeId: scheme, amountPaise: 100_000, mode: 'CASH' } };
    const res = (await push(staffA, [sale(), sale({ lines: undefined }), dairy]).expect(200)).body.results;
    expect(res.map((r: any) => r.status)).toEqual(['APPLIED', 'FAILED', 'APPLIED']);
  });
});
