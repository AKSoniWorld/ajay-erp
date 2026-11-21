import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import request from 'supertest';
import { financialYearCode, formatDocNumber } from '../src/engines/numbering';

let app: INestApplication, mongo: MongoMemoryReplSet, invoiceModel: any;
let admin = '', owner = '', staff = '', staff2 = '';
let branchA = '', branchB = '', cat = '', sub = '', chain = '', silver = '', customer = '';
let invA = '', invC = '', invD = '';
const fy = financialYearCode();
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (mobile: string, password: string) =>
  (await http().post('/api/v1/auth/login').send({ mobile, password })).body.accessToken as string;
const RATE = 700_123; // ₹7,001.23 per gram, 22K gold
const setRate = (rate: number, extra = {}) => http().post('/api/v1/rates').set(auth(admin))
  .send({ metal: 'GOLD', karat: 22, kind: 'SALE', ratePerGramPaise: rate, reason: 'test rate', ...extra });
const draft = (t: string, qty = 1, withCustomer = true) => http().post('/api/v1/pos/invoices').set(auth(t))
  .send({ branchId: branchA, lines: [{ productId: chain, qty }], ...(withCustomer && { customerId: customer }) });
const finalize = (t: string, id: string, payments: any[]) =>
  http().post(`/api/v1/pos/invoices/${id}/finalize`).set(auth(t)).send({ payments });
const stockQty = async () =>
  (await http().get(`/api/v1/inventory?branchId=${branchA}`).set(auth(admin))).body.items[0]?.qty;

// 22K chain, 10 g net @ ₹7,001.23/g = ₹70,012.30 + making 10 g × ₹500 = ₹5,000 → +3% GST → ₹77,262.67 → rounds to ₹77,263 (+33 paise)
const ONE = 7_726_300;       // qty 1 payable (paise)
const THREE = 23_178_800;    // qty 3: ₹2,31,788.01 → ₹2,31,788


beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest3'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { Invoice } = await import('../src/modules/pos/invoice.schema');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  invoiceModel = app.get(getModelToken(Invoice.name));

  admin = await login('9876543210', 'Admin@12345');
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1' })).body._id;
  branchB = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC2', name: 'Two', invoicePrefix: 'RNC2' })).body._id;
  const mk = (name: string, mobile: string, password: string, role: string) =>
    http().post('/api/v1/users').set(auth(admin)).send({ name, mobile, password, role, branchIds: [branchA] });
  await mk('Owner', '9123456781', 'Owner@12345', 'OWNER');
  await mk('Ravi', '9123456780', 'Staff@12345', 'STAFF');
  await mk('Sita', '9123456782', 'Staff@12345', 'STAFF');
  owner = await login('9123456781', 'Owner@12345');
  staff = await login('9123456780', 'Staff@12345');
  staff2 = await login('9123456782', 'Staff@12345');

  cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold' })).body._id;
  sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  const base = { categoryId: cat, subcategoryId: sub, makingValue: 50_000 };
  chain = (await http().post('/api/v1/products').set(auth(admin)).send({ ...base, name: 'Gold Chain', metal: 'GOLD',
    karat: 22, grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM' })).body._id;
  silver = (await http().post('/api/v1/products').set(auth(admin)).send({ ...base, name: 'Silver Plate', metal: 'SILVER',
    purityPct: 92.5, grossMg: 50_000, makingType: 'FLAT', makingValue: 100_000 })).body._id;
  await http().post('/api/v1/inventory/adjust').set(auth(admin))
    .send({ productId: chain, branchId: branchA, qty: 5, type: 'OPENING' }).expect(201);
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Phase 3 – rates', () => {
  it('only ADMIN sets rates; >10% jumps need confirmation; history is kept', async () => {
    await http().post('/api/v1/rates').set(auth(staff))
      .send({ metal: 'GOLD', kind: 'SALE', ratePerGramPaise: 700_000, reason: 'nope' }).expect(403);
    await setRate(RATE).expect(201);
    await setRate(900_000).expect(400);                                  // fat-finger guard
    await setRate(900_000, { confirmLargeChange: true }).expect(201);
    await setRate(RATE, { confirmLargeChange: true }).expect(201);
    const cur = await http().get('/api/v1/rates/current').set(auth(staff)).expect(200);
    expect(cur.body.GOLD_22K.SALE.ratePerGramPaise).toBe(RATE);
    expect(cur.body.GOLD_18K.SALE).toBeNull();                              // each grade has its own rate
    expect((await http().get('/api/v1/rates/history?metal=GOLD&karat=22').set(auth(owner)).expect(200)).body.total).toBe(3);
    await http().get('/api/v1/rates/history').set(auth(staff)).expect(403);
  });
});

describe('Phase 3 – quote, search, customers', () => {
  it('prices server-side with GST and rupee round-off', async () => {
    const r = await http().post('/api/v1/pos/quote').set(auth(staff)).send({ branchId: branchA, lines: [{ productId: chain }] }).expect(200);
    expect(r.body.totals).toMatchObject({ jewellery: 7_001_230, making: 500_000, gst: 225_037, finalPayable: ONE, roundOff: 33 });
  });
  it('refuses to price a metal with no sale rate', async () => {
    const r = await http().post('/api/v1/pos/quote').set(auth(staff)).send({ branchId: branchA, lines: [{ productId: silver }] }).expect(400);
    expect(r.body.message).toMatch(/SILVER sale rate not set/);
  });
  it('search and QR scan return branch stock', async () => {
    const s = await http().get(`/api/v1/pos/search?branchId=${branchA}&q=chain`).set(auth(staff)).expect(200);
    expect(s.body[0].qty).toBe(5);
    const b = await http().get(`/api/v1/pos/search?branchId=${branchA}&code=AJ:${s.body[0].sku}`).set(auth(staff)).expect(200);
    expect(b.body[0]._id).toBe(chain);
    await http().get(`/api/v1/pos/search?branchId=${branchB}&q=chain`).set(auth(staff)).expect(404); // not their branch
  });
  it('creates customers; duplicate mobile rejected', async () => {
    customer = (await http().post('/api/v1/customers').set(auth(staff)).send({ name: 'Anita', mobile: '9000000001' }).expect(201)).body._id;
    await http().post('/api/v1/customers').set(auth(staff)).send({ name: 'Dup', mobile: '9000000001' }).expect(409);
  });
});

describe('Phase 3 – finalize (atomic, numbered, locked)', () => {
 it('allows a cash payment of ₹2 lakh or more and finalizes the invoice', async () => {
  invA = (await draft(staff, 3).expect(201)).body._id;

  const ok = await finalize(
    staff,
    invA,
    [{ mode: 'CASH', amountPaise: THREE }],
  ).expect(200);

  expect(ok.body).toMatchObject({
    status: 'FINAL',
    locked: true,
    number: formatDocNumber('RNC1', fy, 1),
  });

  expect(ok.body.contentHash).toHaveLength(64);
  expect(await stockQty()).toBe(2);
});

  it('insufficient stock aborts everything and leaves the draft intact', async () => {
    const id = (await draft(staff, 3).expect(201)).body._id;
    const r = await finalize(staff, id, [{ mode: 'UPI', amountPaise: THREE }]).expect(400);
    expect(r.body.message).toMatch(/Insufficient stock/);
    expect((await http().get(`/api/v1/pos/invoices/${id}`).set(auth(staff))).body.status).toBe('DRAFT');
    expect(await stockQty()).toBe(2);
    const c = await http().post(`/api/v1/pos/invoices/${id}/cancel`).set(auth(staff)).send({ reason: 'customer left' }).expect(200);
    expect(c.body).toMatchObject({ status: 'CANCELLED', locked: true });
  });

  it('needs a customer and exact payments; sequence continues without gaps', async () => {
    invC = (await draft(staff, 1, false).expect(201)).body._id;
    expect((await finalize(staff, invC, []).expect(400)).body.message).toMatch(/Customer is required/);
    await http().patch(`/api/v1/pos/invoices/${invC}`).set(auth(staff)).send({ customerId: customer }).expect(200);
    expect((await finalize(staff, invC, [{ mode: 'UPI', amountPaise: 100 }]).expect(400)).body.message).toMatch(/must equal/);
    expect(await stockQty()).toBe(2);
    const ok = await finalize(staff, invC, [{ mode: 'CASH', amountPaise: 3_000_000 }, { mode: 'UPI', amountPaise: ONE - 3_000_000 }]).expect(200);
    expect(ok.body.number).toBe(formatDocNumber('RNC1', fy, 2));
    expect(ok.body.totals.roundOff).toBe(33);
    expect(await stockQty()).toBe(1);
    // retry of an already-final invoice is safe (idempotent), not a double sale
    await finalize(staff, invC, [{ mode: 'UPI', amountPaise: ONE }]).expect(200);
    expect(await stockQty()).toBe(1);
  });

  it('a finalized invoice is immutable and tamper-evident', async () => {
    await http().patch(`/api/v1/pos/invoices/${invC}`).set(auth(staff)).send({ remarks: 'edit' }).expect(409);
    const r = await invoiceModel.updateOne({ _id: invC }, { $set: { remarks: 'sneaky' } });
    expect(r.matchedCount).toBe(0);                                      // locked docs never match an update
    await expect(invoiceModel.deleteOne({ _id: invC })).rejects.toThrow('cannot be deleted');
    expect((await http().get(`/api/v1/pos/invoices/${invC}/verify`).set(auth(owner)).expect(200)).body.ok).toBe(true);
    await invoiceModel.collection.updateOne({ _id: new Types.ObjectId(invA) }, { $set: { 'totals.finalPayable': 1 } });
    expect((await http().get(`/api/v1/pos/invoices/${invA}/verify`).set(auth(owner)).expect(200)).body.ok).toBe(false);
  });

  it('detects a price change between draft and finalize', async () => {
    invD = (await draft(staff, 1).expect(201)).body._id;
    await setRate(735_000).expect(201);                                  // +5%
    const r = await finalize(staff, invD, [{ mode: 'UPI', amountPaise: ONE }]).expect(409);
    expect(r.body.code).toBe('PRICE_CHANGED');
    await setRate(RATE).expect(201);
    const ok = await finalize(staff, invD, [{ mode: 'UPI', amountPaise: ONE }]).expect(200);
    expect(ok.body.number).toBe(formatDocNumber('RNC1', fy, 3));
    expect(await stockQty()).toBe(0);
  });
});

describe('Phase 3 – credit note', () => {
  it('reverses a sale once: stock returns, totals negate, numbered separately', async () => {
    await http().post(`/api/v1/pos/invoices/${invC}/credit-note`).set(auth(staff)).send({ reason: 'return', refunds: [] }).expect(403);
    await http().post(`/api/v1/pos/invoices/${invC}/credit-note`).set(auth(owner)).send({ reason: 'return', refunds: [{ mode: 'CASH', amountPaise: 100 }] }).expect(400);
    const cn = await http().post(`/api/v1/pos/invoices/${invC}/credit-note`).set(auth(owner))
      .send({ reason: 'customer return', refunds: [{ mode: 'CASH', amountPaise: ONE }] }).expect(201);
    expect(cn.body).toMatchObject({ type: 'CREDIT_NOTE', number: formatDocNumber('RNC1', fy, 1, 'CN'), creditNoteOf: invC });
    expect(cn.body.totals.finalPayable).toBe(-ONE);
    expect(await stockQty()).toBe(1);
    await http().post(`/api/v1/pos/invoices/${invC}/credit-note`).set(auth(owner))
      .send({ reason: 'again', refunds: [{ mode: 'CASH', amountPaise: ONE }] }).expect(409);
  });
});

describe('Phase 3 – customer copy, isolation, concurrency', () => {
  it('customer view carries amounts only — no metal rates or exchange/dairy detail', async () => {
    const r = await http().get(`/api/v1/pos/invoices/${invC}/customer-view`).set(auth(staff)).expect(200);
    expect(r.body).toMatchObject({ netPayable: ONE, roundOff: 33, oldGoldExchange: 0, oldSilverExchange: 0, dairyAdjustment: 0 });
    expect(r.body.items[0]).toMatchObject({ sku: expect.any(String), karat: 22, grossWeightMg: 10_500, amount: 7_501_230 });
    expect(r.body.customer.name).toBe('Anita');
    expect(JSON.stringify(r.body)).not.toMatch(/ratePerGram|exchangeDetail|lessMg|dairyBreakdown/);
  });

  it('staff see only their own bills; no cross-branch drafts', async () => {
    await http().get(`/api/v1/pos/invoices/${invC}`).set(auth(staff2)).expect(404);
    expect((await http().get('/api/v1/pos/invoices').set(auth(staff2)).expect(200)).body.total).toBe(0);
    const all = (await http().get('/api/v1/pos/invoices').set(auth(owner)).expect(200)).body;
    expect(all.total).toBeGreaterThanOrEqual(4);
    expect(all.items.find((i: any) => i.number)?.customer).toMatchObject({ name: 'Anita', mobile: '9000000001' });   // the list names the customer
    await http().post('/api/v1/pos/invoices').set(auth(owner)).send({ branchId: branchB, lines: [{ productId: chain }] }).expect(403);
  });

  it('two simultaneous finalizations get distinct, gap-free numbers', async () => {
    await http().post('/api/v1/inventory/adjust').set(auth(admin))
      .send({ productId: chain, branchId: branchA, qty: 4, note: 'restock for test' }).expect(201);
    const [d1, d2] = await Promise.all([draft(staff).then(r => r.body._id), draft(staff).then(r => r.body._id)]);
    const [r1, r2] = await Promise.all([
      finalize(staff, d1, [{ mode: 'UPI', amountPaise: ONE }]), finalize(staff, d2, [{ mode: 'UPI', amountPaise: ONE }])]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const nums = (await invoiceModel.find({ type: 'SALE', status: 'FINAL', branchId: branchA }).lean())
      .map((i: any) => Number(i.number.split('-').pop())).sort((a: number, b: number) => a - b);
    expect(nums).toEqual([1, 2, 3, 4, 5]);
  });
});
