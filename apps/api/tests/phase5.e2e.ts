import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { addMonths } from '../src/engines/dairy.engine';
import { financialYearCode } from '../src/engines/numbering';

let app: INestApplication, mongo: MongoMemoryReplSet, ledgerModel: any;
let admin = '', owner = '', staff = '';
let branchA = '', branchB = '', chain = '', anita = '', bob = '', scheme = '', bobScheme = '', invA = '';
const fy = financialYearCode();
const MONTHLY = 100_000;                                   // ₹1,000 / month
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (m: string, p: string) => (await http().post('/api/v1/auth/login').send({ mobile: m, password: p })).body.accessToken as string;
const pay = (t: string, id: string, amountPaise: number, mode = 'UPI') =>
  http().post(`/api/v1/dairy/schemes/${id}/payments`).set(auth(t)).send({ amountPaise, mode });
const getScheme = async (id: string) => (await http().get(`/api/v1/dairy/schemes/${id}`).set(auth(staff)).expect(200)).body;
const draft = (amount: number, customerId = anita) => http().post('/api/v1/pos/invoices').set(auth(staff))
  .send({ branchId: branchA, customerId, lines: [{ productId: chain }], dairy: [{ schemeId: scheme, amountPaise: amount }] });
const finalize = (id: string, amountPaise: number) =>
  http().post(`/api/v1/pos/invoices/${id}/finalize`).set(auth(staff)).send({ payments: [{ mode: 'UPI', amountPaise }] });
const stockQty = async () => (await http().get(`/api/v1/inventory?branchId=${branchA}`).set(auth(admin))).body.items[0]?.qty;

// Bill: 10 g @ ₹7,000 + making ₹5,000 = ₹75,000 + 3% GST = ₹77,250.00 (7,725,000 paise)
const BILL = 7_725_000;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest5'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { DairyLedger } = await import('../src/modules/dairy/dairy.schema');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  ledgerModel = app.get(getModelToken(DairyLedger.name));

  admin = await login('9876543210', 'Admin@12345');
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1' })).body._id;
  branchB = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC2', name: 'Two', invoicePrefix: 'RNC2' })).body._id;
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
  bob = (await http().post('/api/v1/customers').set(auth(staff)).send({ name: 'Bob', mobile: '9000000002' })).body._id;
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Phase 5 – scheme setup', () => {
  const body = () => ({ customerId: anita, branchId: branchA, startDate: addMonths(new Date(), -3).toISOString(),
    monthlyPaise: MONTHLY, durationMonths: 11, type: 'BONUS' });
  it('only owner/admin create schemes; validates duration, rupees and branch', async () => {
    await http().post('/api/v1/dairy/schemes').set(auth(staff)).send(body()).expect(403);
    await http().post('/api/v1/dairy/schemes').set(auth(owner)).send({ ...body(), durationMonths: 7 }).expect(400);
    const r = await http().post('/api/v1/dairy/schemes').set(auth(owner)).send({ ...body(), monthlyPaise: 12_345 }).expect(400);
    expect(r.body.message).toMatch(/whole rupees/);
    await http().post('/api/v1/dairy/schemes').set(auth(owner)).send({ ...body(), branchId: branchB }).expect(403);
  });
  it('creates a bonus scheme with a numbered scheme number', async () => {
    const r = await http().post('/api/v1/dairy/schemes').set(auth(owner)).send(body()).expect(201);
    scheme = r.body._id;
    expect(r.body).toMatchObject({ schemeNo: `RNC1-DY-${fy}-000001`, status: 'ACTIVE', balancePaise: 0, paidPaise: 0 });
  });
});

describe('Phase 5 – monthly collection', () => {
  it('must be whole instalments; first payment gives a numbered receipt; missed months are tracked', async () => {
    const bad = await pay(staff, scheme, 150_000).expect(400);
    expect(bad.body.message).toMatch(/whole number of installments/);
    const r = await pay(staff, scheme, MONTHLY).expect(201);
    expect(r.body.receiptNo).toBe(`RNC1-DR-${fy}-000001`);
    expect(r.body.scheme).toMatchObject({ paidMonths: 1, balancePaise: MONTHLY });
    expect(await getScheme(scheme)).toMatchObject({ paidMonths: 1, missedMonths: 3, status: 'ACTIVE', customer: { name: 'Anita' } }); // started 3 months ago
  });
  it('advance / multi-month payment clears the missed months', async () => {
    await pay(staff, scheme, 3 * MONTHLY, 'CASH').expect(201);
    expect(await getScheme(scheme)).toMatchObject({ paidMonths: 4, missedMonths: 0, balancePaise: 4 * MONTHLY });
  });
  it('cannot collect more than the scheme total', async () => {
    const r = await pay(staff, scheme, 20 * MONTHLY).expect(400);
    expect(r.body.message).toMatch(/exceeds the remaining/);
  });
  it('receipt shows amounts and instalment counts only', async () => {
    const r = await http().get(`/api/v1/dairy/receipts/RNC1-DR-${fy}-000001`).set(auth(staff)).expect(200);
    expect(r.body).toMatchObject({ amountPaise: MONTHLY, monthsCovered: 1, installmentsPaid: 1, totalInstallments: 11, customer: { name: 'Anita' } });
    expect(JSON.stringify(r.body)).not.toMatch(/gold|fine|weight|rate/i);
  });
});

describe('Phase 5 – maturity and bonus', () => {
  it('completing the scheme credits the bonus instalment', async () => {
    const r = await pay(staff, scheme, 7 * MONTHLY).expect(201);
    expect(r.body.scheme).toMatchObject({ status: 'COMPLETED', paidMonths: 11, balancePaise: 12 * MONTHLY, canRedeem: true });
    await pay(staff, scheme, MONTHLY).expect(400);
    const s = await getScheme(scheme);
    expect(s.ledger.filter((e: any) => e.direction === 'CREDIT').reduce((a: number, e: any) => a + e.amountPaise, 0)).toBe(12 * MONTHLY);
    expect(s.ledger.map((e: any) => e.kind)).toContain('BONUS');
  });
  it('a scheme past its end date with a shortfall can still be redeemed (what was paid)', async () => {
    bobScheme = (await http().post('/api/v1/dairy/schemes').set(auth(owner)).send({ customerId: bob, branchId: branchA,
      startDate: addMonths(new Date(), -8).toISOString(), monthlyPaise: MONTHLY, durationMonths: 6, type: 'NORMAL' }).expect(201)).body._id;
    await pay(staff, bobScheme, 2 * MONTHLY).expect(201);
    const [s] = (await http().get(`/api/v1/dairy/customer/${bob}/balance`).set(auth(staff)).expect(200)).body;
    expect(s).toMatchObject({ status: 'MATURED_SHORTFALL', balancePaise: 2 * MONTHLY, canRedeem: true });
  });
});

describe('Phase 5 – dairy adjustment on a bill', () => {
  it('shows redeemable balance to the POS', async () => {
    const r = await http().get(`/api/v1/dairy/customer/${anita}/balance`).set(auth(staff)).expect(200);
    expect(r.body[0]).toMatchObject({ schemeId: scheme, balancePaise: 12 * MONTHLY, canRedeem: true });
  });
  it('dairy comes after old metal in the calculation; limited by the balance and the customer', async () => {
    const q = (extra: any) => http().post('/api/v1/pos/quote').set(auth(staff)).send({ branchId: branchA, lines: [{ productId: chain }], ...extra });
    const ok = await q({ customerId: anita, dairy: [{ schemeId: scheme, amountPaise: 1_000_000 }] }).expect(200);
    expect(ok.body.totals).toMatchObject({ grossTotal: BILL, dairy: 1_000_000, subtotal: BILL, finalPayable: BILL - 1_000_000, roundOff: 0 });
    expect((await q({ customerId: anita, dairy: [{ schemeId: scheme, amountPaise: 5_000_000 }] }).expect(400)).body.message).toMatch(/exceeds the balance/);
    expect((await q({ customerId: bob, dairy: [{ schemeId: scheme, amountPaise: 100_000 }] }).expect(400)).body.message).toMatch(/not found for this customer/);
    expect((await q({ dairy: [{ schemeId: scheme, amountPaise: 100_000 }] }).expect(400)).body.message).toMatch(/Select the customer/);
  });
  it('finalize deducts the balance and links the ledger entry to the invoice', async () => {
    invA = (await draft(1_000_000).expect(201)).body._id;
    const ok = await finalize(invA, BILL - 1_000_000).expect(200);
    expect(ok.body).toMatchObject({ status: 'FINAL', locked: true });
    expect(ok.body.dairyLedgerIds).toHaveLength(1);
    const s = await getScheme(scheme);
    expect(s.balancePaise).toBe(200_000);
    expect(s.ledger[0]).toMatchObject({ direction: 'DEBIT', kind: 'INVOICE', amountPaise: 1_000_000, invoiceNumber: ok.body.number, balanceAfter: 200_000 });
    expect((await http().get(`/api/v1/pos/invoices/${invA}/verify`).set(auth(owner))).body.ok).toBe(true);
  });
  it('customer copy shows the dairy adjustment as an amount only', async () => {
    const r = await http().get(`/api/v1/pos/invoices/${invA}/customer-view`).set(auth(staff)).expect(200);
    expect(r.body).toMatchObject({ dairyAdjustment: 1_000_000, netPayable: BILL - 1_000_000 });
    expect(JSON.stringify(r.body)).not.toMatch(/schemeId|schemeNo|ledger|monthly|bonus|-DY-/i);
  });
  it('invoices that used dairy cannot be auto-credited', async () => {
    const r = await http().post(`/api/v1/pos/invoices/${invA}/credit-note`).set(auth(owner))
      .send({ reason: 'return', refunds: [{ mode: 'UPI', amountPaise: BILL - 1_000_000 }] }).expect(400);
    expect(r.body.message).toMatch(/dairy/);
  });
  it('two bills racing for the same balance: exactly one wins, nothing goes negative, loser rolls back fully', async () => {
    const stockBefore = await stockQty();
    const [d1, d2] = await Promise.all([draft(150_000).then(r => r.body._id), draft(150_000).then(r => r.body._id)]);
    const [r1, r2] = await Promise.all([finalize(d1, BILL - 150_000), finalize(d2, BILL - 150_000)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
    expect((await getScheme(scheme)).balancePaise).toBe(50_000);
    expect(await stockQty()).toBe(stockBefore - 1);            // the losing bill did not touch stock
  });
});

describe('Phase 5 – admin corrections and integrity', () => {
  it('using the last of the balance marks the scheme REDEEMED', async () => {
    const id = (await draft(50_000).expect(201)).body._id;
    await finalize(id, BILL - 50_000).expect(200);
    expect(await getScheme(scheme)).toMatchObject({ status: 'REDEEMED', balancePaise: 0, canRedeem: false });
  });
  it('manual adjustments are admin-only and guarded', async () => {
    const adj = (t: string, type: string, amountPaise: number) =>
      http().post('/api/v1/dairy/adjustments').set(auth(t)).send({ schemeId: scheme, type, amountPaise, reason: 'goodwill credit' });
    await adj(owner, 'CREDIT', 10_000).expect(403);
    await adj(admin, 'DEBIT', 1).expect(400);                  // nothing left to take
    await adj(admin, 'CREDIT', 10_000).expect(201);
    expect(await getScheme(scheme)).toMatchObject({ balancePaise: 10_000, status: 'COMPLETED' });
  });
  it('ledger always reconciles with the balance, and is append-only', async () => {
    const rows = await ledgerModel.find({ schemeId: scheme }).lean();
    const net = rows.reduce((a: number, e: any) => a + (e.direction === 'CREDIT' ? e.amountPaise : -e.amountPaise), 0);
    expect(net).toBe((await getScheme(scheme)).balancePaise);
    await expect(ledgerModel.updateOne({}, { amountPaise: 1 })).rejects.toThrow('append-only');
    await expect(ledgerModel.deleteMany({})).rejects.toThrow('append-only');
  });
});

describe('Phase 5 – using dairy early (no bonus)', () => {
  let carol = '', carolScheme = '';
  const q = (confirm?: boolean) => http().post('/api/v1/pos/quote').set(auth(staff)).send({
    branchId: branchA, customerId: carol, lines: [{ productId: chain }],
    dairy: [{ schemeId: carolScheme, amountPaise: MONTHLY, ...(confirm && { confirmForfeitBonus: true }) }] });

  it('usable any time, but a bonus scheme needs confirmation because early use cancels the bonus', async () => {
    carol = (await http().post('/api/v1/customers').set(auth(staff)).send({ name: 'Carol', mobile: '9000000003' })).body._id;
    carolScheme = (await http().post('/api/v1/dairy/schemes').set(auth(owner)).send({ customerId: carol, branchId: branchA,
      startDate: new Date().toISOString(), monthlyPaise: MONTHLY, durationMonths: 6, type: 'BONUS' }).expect(201)).body._id;
    await pay(staff, carolScheme, 2 * MONTHLY).expect(201);
    expect((await q().expect(400)).body.code).toBe('BONUS_FORFEIT');
    await q(true).expect(200);
    const [s] = (await http().get(`/api/v1/dairy/customer/${carol}/balance`).set(auth(staff)).expect(200)).body;
    expect(s).toMatchObject({ status: 'ACTIVE', canRedeem: true, forfeitsBonusIfUsed: true });
  });
  it('after early use the scheme continues but never earns the bonus', async () => {
    const id = (await http().post('/api/v1/pos/invoices').set(auth(staff)).send({ branchId: branchA, customerId: carol,
      lines: [{ productId: chain }], dairy: [{ schemeId: carolScheme, amountPaise: MONTHLY, confirmForfeitBonus: true }] }).expect(201)).body._id;
    await finalize(id, BILL - MONTHLY).expect(200);
    let s = await getScheme(carolScheme);
    expect(s).toMatchObject({ balancePaise: MONTHLY, bonusForfeited: true });
    expect(s.ledger[0].note).toMatch(/bonus cancelled/);
    await pay(staff, carolScheme, 4 * MONTHLY).expect(201);        // finishes all 6 instalments
    s = await getScheme(carolScheme);
    expect(s).toMatchObject({ status: 'COMPLETED', balancePaise: 5 * MONTHLY });   // 6 paid − 1 used = 5, no bonus added
    expect(s.ledger.map((e: any) => e.kind)).not.toContain('BONUS');
  });
  it('a normal (no-bonus) scheme can be used any time without confirmation', async () => {
    await http().post('/api/v1/pos/quote').set(auth(staff)).send({ branchId: branchA, customerId: bob, lines: [{ productId: chain }],
      dairy: [{ schemeId: bobScheme, amountPaise: MONTHLY }] }).expect(200);
  });
});
