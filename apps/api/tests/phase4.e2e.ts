import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

let app: INestApplication, mongo: MongoMemoryReplSet, rawMoves: any;
let admin = '', owner = '', staff = '';
let branchA = '', cat = '', sub = '', chain = '', customer = '', invX = '';
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (m: string, p: string) => (await http().post('/api/v1/auth/login').send({ mobile: m, password: p })).body.accessToken as string;
const setRate = (metal: string, karat: number | undefined, kind: string, rate: number) =>
  http().post('/api/v1/rates').set(auth(admin)).send({ metal, ...(karat && { karat }), kind, ratePerGramPaise: rate, reason: 'test rate', confirmLargeChange: true });
const EX = [{ metal: 'GOLD', grossMg: 10_500, lessMg: 500, purityPct: 91.6 }];  // net 10 g → fine 9.160 g
const draft = (t: string, exchanges: any[] | undefined = EX) => http().post('/api/v1/pos/invoices').set(auth(t))
  .send({ branchId: branchA, customerId: customer, lines: [{ productId: chain }], ...(exchanges && { exchanges }) });
const raw = async () => (await http().get(`/api/v1/raw-inventory?branchId=${branchA}`).set(auth(owner))).body;

// Sale: 10 g × ₹7,000 = ₹70,000 + making ₹5,000 + 3% GST = ₹77,250.00
// Old gold: fine 9.160 g × ₹6,501.23 = ₹59,551.27  → ₹17,698.73 → rounds to ₹17,699 (+27 paise)
const EX_VALUE = 5_955_127, PAYABLE = 1_769_900;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest4'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { RawMovement } = await import('../src/modules/exchange/raw.schema');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  rawMoves = app.get(getModelToken(RawMovement.name));

  admin = await login('9876543210', 'Admin@12345');
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1' })).body._id;
  const mk = (n: string, m: string, p: string, r: string) =>
    http().post('/api/v1/users').set(auth(admin)).send({ name: n, mobile: m, password: p, role: r, branchIds: [branchA] });
  await mk('Owner', '9123456781', 'Owner@12345', 'OWNER'); await mk('Ravi', '9123456780', 'Staff@12345', 'STAFF');
  owner = await login('9123456781', 'Owner@12345'); staff = await login('9123456780', 'Staff@12345');
  cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold' })).body._id;
  sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  chain = (await http().post('/api/v1/products').set(auth(admin)).send({ name: 'Gold Chain', categoryId: cat, subcategoryId: sub,
    metal: 'GOLD', karat: 22, grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM', makingValue: 50_000 })).body._id;
  await http().post('/api/v1/inventory/adjust').set(auth(admin)).send({ productId: chain, branchId: branchA, qty: 5, type: 'OPENING' });
  customer = (await http().post('/api/v1/customers').set(auth(staff)).send({ name: 'Anita', mobile: '9000000001' })).body._id;
  await setRate('GOLD', 22, 'SALE', 700_000);
  await setRate('GOLD', 22, 'EXCHANGE', 650_123);
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Phase 4 – exchange pricing (fine weight)', () => {
  it('previews fine weight and value; rate is server-side only', async () => {
    const r = await http().post('/api/v1/exchange/preview').set(auth(staff)).send({ exchanges: EX }).expect(200);
    expect(r.body.items[0]).toMatchObject({ netMg: 10_000, fineMg: 9_160, ratePerGramPaise: 650_123, valuePaise: EX_VALUE });
    expect(r.body.totals).toMatchObject({ goldFineMg: 9_160, goldValuePaise: EX_VALUE });
    await http().post('/api/v1/exchange/preview').set(auth(staff))
      .send({ exchanges: [{ ...EX[0], ratePerGramPaise: 999_999 }] }).expect(400);          // client cannot set the rate
  });
  it('validates weights, purity and missing rates', async () => {
    await http().post('/api/v1/exchange/preview').set(auth(staff)).send({ exchanges: [{ ...EX[0], lessMg: 10_500 }] }).expect(400);
    await http().post('/api/v1/exchange/preview').set(auth(staff)).send({ exchanges: [{ ...EX[0], purityPct: 0 }] }).expect(400);
    const r = await http().post('/api/v1/exchange/preview').set(auth(staff))
      .send({ exchanges: [{ metal: 'SILVER', grossMg: 5_000, lessMg: 0, purityPct: 92.5 }] }).expect(400);
    expect(r.body.message).toMatch(/SILVER exchange rate not set/);
  });
  it('quote subtracts old gold, then rounds to whole rupees', async () => {
    const r = await http().post('/api/v1/pos/quote').set(auth(staff))
      .send({ branchId: branchA, lines: [{ productId: chain }], exchanges: EX }).expect(200);
    expect(r.body.totals).toMatchObject({ grossTotal: 7_725_000, goldExchange: EX_VALUE, subtotal: 1_769_873, finalPayable: PAYABLE, roundOff: 27 });
    const big = await http().post('/api/v1/pos/quote').set(auth(staff))
      .send({ branchId: branchA, lines: [{ productId: chain }], exchanges: [{ metal: 'GOLD', grossMg: 100_000, lessMg: 0, purityPct: 99 }] }).expect(400);
    expect(big.body.message).toMatch(/exceeds the bill/);
  });
});

describe('Phase 4 – finalize with old gold', () => {
  it('records the exchange, adds fine metal to raw inventory, locks the invoice', async () => {
    invX = (await draft(staff).expect(201)).body._id;
    const ok = await http().post(`/api/v1/pos/invoices/${invX}/finalize`).set(auth(staff)).send({ payments: [{ mode: 'UPI', amountPaise: PAYABLE }] }).expect(200);
    expect(ok.body).toMatchObject({ status: 'FINAL', locked: true });
    expect(ok.body.exchangeIds).toHaveLength(1);
    const ex = await http().get(`/api/v1/exchange?branchId=${branchA}`).set(auth(owner)).expect(200);
    expect(ex.body.total).toBe(1);
    expect(ex.body.items[0]).toMatchObject({ invoiceNumber: ok.body.number, totals: { goldNetMg: 10_000, goldFineMg: 9_160, goldValuePaise: EX_VALUE } });
    expect(await raw()).toEqual([expect.objectContaining({ metal: 'GOLD', netMg: 10_000, fineMg: 9_160 })]);
    expect((await http().get(`/api/v1/pos/invoices/${invX}/verify`).set(auth(owner))).body.ok).toBe(true);
  });
  it('exchange records are internal: staff cannot list them', async () => {
    await http().get('/api/v1/exchange').set(auth(staff)).expect(403);
    await http().get('/api/v1/raw-inventory').set(auth(staff)).expect(403);
  });
  it('invoices with old metal cannot be auto-credited', async () => {
    const r = await http().post(`/api/v1/pos/invoices/${invX}/credit-note`).set(auth(owner))
      .send({ reason: 'return', refunds: [{ mode: 'UPI', amountPaise: PAYABLE }] }).expect(400);
    expect(r.body.message).toMatch(/old-metal exchange/);
  });
  it('detects an exchange-rate change between draft and finalize', async () => {
    const id = (await draft(staff).expect(201)).body._id;
    await setRate('GOLD', 22, 'EXCHANGE', 660_000).expect(201);
    const r = await http().post(`/api/v1/pos/invoices/${id}/finalize`).set(auth(staff)).send({ payments: [{ mode: 'UPI', amountPaise: PAYABLE }] }).expect(409);
    expect(r.body.code).toBe('PRICE_CHANGED');
    await setRate('GOLD', 22, 'EXCHANGE', 650_123).expect(201);
    await http().post(`/api/v1/pos/invoices/${id}/cancel`).set(auth(staff)).send({ reason: 'test' }).expect(200);
  });
});

describe('Phase 4 – customer copy', () => {
  it('shows only the amount by default', async () => {
    const r = await http().get(`/api/v1/pos/invoices/${invX}/customer-view`).set(auth(staff)).expect(200);
    expect(r.body).toMatchObject({ oldGoldExchange: EX_VALUE, oldSilverExchange: 0, roundOff: 27, netPayable: PAYABLE });
    expect(JSON.stringify(r.body)).not.toMatch(/FineWeight|fineMg|lessMg|netMg|ratePerGram|exchangeDetail|oldGoldPurity/);
  });
  it('can also show total fine weight (jama) when the branch allows — still nothing else', async () => {
    await http().patch(`/api/v1/branches/${branchA}`).set(auth(admin)).send({ exchangeDisplay: 'AMOUNT_AND_FINE_WEIGHT' }).expect(200);
    const r = await http().get(`/api/v1/pos/invoices/${invX}/customer-view`).set(auth(staff)).expect(200);
    expect(r.body).toMatchObject({ oldGoldExchange: EX_VALUE, oldGoldFineWeightMg: 9_160, oldSilverFineWeightMg: 0 });
    expect(JSON.stringify(r.body)).not.toMatch(/lessMg|netMg|ratePerGram|exchangeDetail|oldGoldPurity/);
    await http().patch(`/api/v1/branches/${branchA}`).set(auth(admin)).send({ exchangeDisplay: 'AMOUNT' }).expect(200);
  });
});

describe('Phase 4 – draft edits are tracked', () => {
  it('keeps the previous exchange items when changed or cleared', async () => {
    const id = (await draft(staff).expect(201)).body._id;
    const e1 = await http().patch(`/api/v1/pos/invoices/${id}`).set(auth(staff))
      .send({ exchanges: [{ metal: 'GOLD', grossMg: 10_500, lessMg: 400, purityPct: 90 }] }).expect(200);
    expect(e1.body.exchanges[0]).toMatchObject({ netMg: 10_100, fineMg: 9_090 });
    expect(e1.body.exchangeEdits).toHaveLength(1);
    expect(e1.body.exchangeEdits[0].before[0]).toMatchObject({ fineMg: 9_160 });
    const e2 = await http().patch(`/api/v1/pos/invoices/${id}`).set(auth(staff)).send({ exchanges: [] }).expect(200);
    expect(e2.body.totals.goldExchange).toBe(0); expect(e2.body.exchangeEdits).toHaveLength(2);
    await http().post(`/api/v1/pos/invoices/${id}/cancel`).set(auth(staff)).send({ reason: 'test' }).expect(200);
  });
});

describe('Phase 4 – raw inventory', () => {
  it('melt-out reduces net and fine; cannot go below zero; staff blocked', async () => {
    const body = { branchId: branchA, metal: 'GOLD', type: 'MELT_OUT', netMg: -4_000, fineMg: -3_664, note: 'sent to refiner' };
    await http().post('/api/v1/raw-inventory/adjust').set(auth(staff)).send(body).expect(403);
    await http().post('/api/v1/raw-inventory/adjust').set(auth(owner)).send({ ...body, netMg: -99_000, fineMg: -90_000 }).expect(400);
    await http().post('/api/v1/raw-inventory/adjust').set(auth(owner)).send({ ...body, type: 'EXCHANGE_IN' }).expect(400);
    await http().post('/api/v1/raw-inventory/adjust').set(auth(owner)).send(body).expect(201);
    expect(await raw()).toEqual([expect.objectContaining({ netMg: 6_000, fineMg: 5_496 })]);
    const mv = await http().get(`/api/v1/raw-inventory/movements?branchId=${branchA}`).set(auth(owner)).expect(200);
    expect(mv.body.items.map((m: any) => m.type).sort()).toEqual(['EXCHANGE_IN', 'MELT_OUT']);
  });
  it('raw movements are append-only', async () => {
    await expect(rawMoves.updateOne({}, { netMg: 1 })).rejects.toThrow('append-only');
    await expect(rawMoves.deleteMany({})).rejects.toThrow('append-only');
  });
});
