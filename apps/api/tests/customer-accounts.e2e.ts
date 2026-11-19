import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { financialYearCode } from '../src/engines/numbering';

let app: INestApplication, mongo: MongoMemoryReplSet, ledgerModel: any;
let admin = '', owner = '', staff = '';
let branchA = '', chain = '', anita = '', i1 = '', i2 = '';
const fy = financialYearCode();
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (m: string, p: string) => (await http().post('/api/v1/auth/login').send({ mobile: m, password: p })).body.accessToken as string;
const account = async (t: string) => (await http().get(`/api/v1/customers/${anita}/account`).set(auth(t)).expect(200)).body;
const statement = async (acc: string, t = staff) => (await http().get(`/api/v1/customers/${anita}/statement?account=${acc}`).set(auth(t)).expect(200)).body;
const draft = (extra: any = {}) => http().post('/api/v1/pos/invoices').set(auth(staff))
  .send({ branchId: branchA, customerId: anita, lines: [{ productId: chain }], ...extra });
const finalize = (t: string, id: string, payments: any[], extra: any = {}) =>
  http().post(`/api/v1/pos/invoices/${id}/finalize`).set(auth(t)).send({ payments, ...extra });
const view = async (id: string) => (await http().get(`/api/v1/pos/invoices/${id}/customer-view`).set(auth(staff)).expect(200)).body;

const BILL = 7_725_000; // 10 g @ ₹7,000 + ₹5,000 making + 3% GST

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest6'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { CustomerLedger } = await import('../src/modules/accounts/account.schema');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  ledgerModel = app.get(getModelToken(CustomerLedger.name));

  admin = await login('9876543210', 'Admin@12345');
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1' })).body._id;
  const mk = (n: string, m: string, p: string, r: string) =>
    http().post('/api/v1/users').set(auth(admin)).send({ name: n, mobile: m, password: p, role: r, branchIds: [branchA] });
  await mk('Owner', '9123456781', 'Owner@12345', 'OWNER'); await mk('Ravi', '9123456780', 'Staff@12345', 'STAFF');
  owner = await login('9123456781', 'Owner@12345'); staff = await login('9123456780', 'Staff@12345');
  const cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold' })).body._id;
  const sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  chain = (await http().post('/api/v1/products').set(auth(admin)).send({ name: 'Gold Chain', categoryId: cat, subcategoryId: sub,
    metal: 'GOLD', karat: 22, grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM', makingValue: 50_000 })).body._id;
  await http().post('/api/v1/inventory/adjust').set(auth(admin)).send({ productId: chain, branchId: branchA, qty: 10, type: 'OPENING' });
  await http().post('/api/v1/rates').set(auth(admin)).send({ metal: 'GOLD', karat: 22, kind: 'SALE', ratePerGramPaise: 700_000, reason: 'test rate' });
  anita = (await http().post('/api/v1/customers').set(auth(staff)).send({ name: 'Anita', mobile: '9000000001' })).body._id;
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Customer accounts – advance', () => {
  it('records an advance with a numbered receipt', async () => {
    const r = await http().post(`/api/v1/customers/${anita}/advance`).set(auth(staff))
      .send({ branchId: branchA, amountPaise: 2_000_000, mode: 'UPI' }).expect(201);
    expect(r.body).toMatchObject({ receiptNo: `RNC1-AR-${fy}-000001`, advancePaise: 2_000_000, duePaise: 0 });
    expect(await account(staff)).toMatchObject({ advance: { balancePaise: 2_000_000 }, due: { balancePaise: 0 },
      dairy: { balancePaise: 0, schemes: [] }, purchases: { invoiceCount: 0, totalPaise: 0 } });
  });
  it('cash advances count toward the ₹2 lakh daily limit', async () => {
    const r = await http().post(`/api/v1/customers/${anita}/advance`).set(auth(staff))
      .send({ branchId: branchA, amountPaise: 20_000_000, mode: 'CASH' }).expect(400);
    expect(r.body.message).toMatch(/269ST/);
  });
  it('can be applied on a bill, but never more than the balance or the bill', async () => {
    const q = (extra: any) => http().post('/api/v1/pos/quote').set(auth(staff)).send({ branchId: branchA, lines: [{ productId: chain }], ...extra });
    expect((await q({ customerId: anita, advancePaise: 2_000_000 }).expect(200)).body.totals.finalPayable).toBe(BILL);
    expect((await q({ customerId: anita, advancePaise: 3_000_000 }).expect(400)).body.message).toMatch(/exceeds the customer's advance balance/);
    expect((await q({ advancePaise: 100 }).expect(400)).body.message).toMatch(/Select the customer/);
  });
  it('finalize uses the advance (guarded, linked to the invoice) and the customer copy shows it', async () => {
    i1 = (await draft({ advancePaise: 2_000_000 }).expect(201)).body._id;
    const bad = await finalize(staff, i1, [{ mode: 'UPI', amountPaise: 5_000_000 }]).expect(400);
    expect(bad.body.message).toMatch(/must equal/);
    const ok = await finalize(staff, i1, [{ mode: 'UPI', amountPaise: BILL - 2_000_000 }]).expect(200);
    expect(ok.body).toMatchObject({ status: 'FINAL', advancePaise: 2_000_000, duePaise: 0 });
    expect((await account(staff)).advance.balancePaise).toBe(0);
    const st = await statement('ADVANCE');
    expect(st.items[0]).toMatchObject({ kind: 'ADVANCE_USED', delta: -2_000_000, balanceAfter: 0, invoiceNumber: ok.body.number });
    expect(st.items[1].kind).toBe('ADVANCE_RECEIPT');
    expect(await view(i1)).toMatchObject({ advanceAdjusted: 2_000_000, amountReceived: BILL - 2_000_000, balanceDue: 0, netPayable: BILL });
    expect((await http().post(`/api/v1/pos/invoices/${i1}/credit-note`).set(auth(owner))
      .send({ reason: 'x', refunds: [{ mode: 'UPI', amountPaise: BILL }] }).expect(400)).body.message).toMatch(/advance/);
  });
});

describe('Customer accounts – due (sale on credit)', () => {
  it('only the owner/admin can leave a balance as due', async () => {
    i2 = (await draft().expect(201)).body._id;
    const pay = [{ mode: 'UPI', amountPaise: 5_000_000 }];
    await finalize(staff, i2, pay, { allowDue: true }).expect(403);
    await finalize(owner, i2, [{ mode: 'UPI', amountPaise: 9_000_000 }], { allowDue: true }).expect(400);   // overpaid
    const ok = await finalize(owner, i2, pay, { allowDue: true }).expect(200);
    expect(ok.body).toMatchObject({ status: 'FINAL', duePaise: 2_725_000 });
    expect(await account(staff)).toMatchObject({ due: { balancePaise: 2_725_000 }, purchases: { invoiceCount: 2, totalPaise: 2 * BILL } });
    expect(await view(i2)).toMatchObject({ amountReceived: 5_000_000, balanceDue: 2_725_000, netPayable: BILL });
  });
  it('collects the due in instalments with numbered receipts; cannot over-collect', async () => {
    const pay = (amountPaise: number, mode = 'UPI') => http().post(`/api/v1/customers/${anita}/dues/payments`).set(auth(staff))
      .send({ branchId: branchA, amountPaise, mode });
    const r1 = await pay(725_000, 'CASH').expect(201);
    expect(r1.body).toMatchObject({ receiptNo: `RNC1-PR-${fy}-000001`, duePaise: 2_000_000 });
    expect((await pay(3_000_000).expect(400)).body.message).toMatch(/exceeds the outstanding due/);
    await pay(2_000_000).expect(201);
    expect((await account(staff)).due.balancePaise).toBe(0);
    const st = await statement('DUE');
    expect(st.items.map((e: any) => [e.kind, e.delta, e.balanceAfter])).toEqual([
      ['DUE_PAYMENT', -2_000_000, 0], ['DUE_PAYMENT', -725_000, 2_000_000], ['DUE_CREATED', 2_725_000, 2_725_000]]);
  });
});

describe('Customer accounts – refunds, totals, internal records', () => {
  it('advance refunds are owner/admin only and limited to the balance', async () => {
    await http().post(`/api/v1/customers/${anita}/advance`).set(auth(staff)).send({ branchId: branchA, amountPaise: 500_000, mode: 'CASH' }).expect(201);
    const body = { amountPaise: 200_000, mode: 'UPI', reason: 'customer changed mind' };
    await http().post(`/api/v1/customers/${anita}/advance/refund`).set(auth(staff)).send(body).expect(403);
    await http().post(`/api/v1/customers/${anita}/advance/refund`).set(auth(owner)).send({ ...body, amountPaise: 900_000 }).expect(400);
    expect((await http().post(`/api/v1/customers/${anita}/advance/refund`).set(auth(owner)).send(body).expect(201)).body.advancePaise).toBe(300_000);
  });
  it('total purchase includes the old-metal sale; exchange totals are hidden from staff', async () => {
    await http().post('/api/v1/rates').set(auth(admin)).send({ metal: 'GOLD', karat: 22, kind: 'EXCHANGE', ratePerGramPaise: 650_123, reason: 'test rate' });
    const id = (await draft({ exchanges: [{ metal: 'GOLD', grossMg: 10_500, lessMg: 500, purityPct: 91.6 }] }).expect(201)).body._id;
    await finalize(staff, id, [{ mode: 'UPI', amountPaise: 1_769_900 }]).expect(200);
    const o = await account(owner);
    expect(o.purchases).toMatchObject({ invoiceCount: 3, totalPaise: 2 * BILL + 1_769_900 });
    expect(o.exchange).toEqual({ goldFineMg: 9_160, silverFineMg: 0, valuePaise: 5_955_127 });
    expect((await account(staff)).exchange).toBeUndefined();
    await http().get(`/api/v1/customers/${anita}/statement?account=EXCHANGES`).set(auth(staff)).expect(403);
    expect((await statement('EXCHANGES', owner)).total).toBe(1);
    expect((await statement('PURCHASES')).total).toBe(3);
  });
  it('admin corrections / write-offs are admin-only and cannot push a balance below zero', async () => {
    const adj = (t: string, type: string, amountPaise: number) => http().post(`/api/v1/customers/${anita}/adjustments`).set(auth(t))
      .send({ account: 'ADVANCE', type, amountPaise, reason: 'goodwill credit' });
    await adj(owner, 'INCREASE', 100_000).expect(403);
    await adj(admin, 'DECREASE', 9_000_000).expect(400);
    expect((await adj(admin, 'INCREASE', 100_000).expect(201)).body.advancePaise).toBe(400_000);
  });
  it('every balance reconciles with its append-only statement', async () => {
    const a = await account(owner);
    const net = async (account: string) => (await ledgerModel.find({ customerId: anita, account }).lean())
      .reduce((s: number, e: any) => s + e.delta, 0);
    expect(await net('ADVANCE')).toBe(a.advance.balancePaise);
    expect(await net('DUE')).toBe(a.due.balancePaise);
    await expect(ledgerModel.updateOne({}, { delta: 1 })).rejects.toThrow('append-only');
    await expect(ledgerModel.deleteMany({})).rejects.toThrow('append-only');
  });
});
