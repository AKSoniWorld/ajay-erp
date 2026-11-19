import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import request from 'supertest';
import { financialYearCode } from '../src/engines/numbering';

let app: INestApplication, mongo: MongoMemoryReplSet, supplierLedger: any;
let admin = '', ownerA = '', ownerB = '', ownerC = '', staffA = '';
let branchA = '', branchB = '', branchC = '', chain = '', supplier = '';
const fy = financialYearCode();
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (m: string, p: string) => (await http().post('/api/v1/auth/login').send({ mobile: m, password: p })).body.accessToken as string;
const stock = async (branch: string) => (await http().get(`/api/v1/inventory?branchId=${branch}`).set(auth(admin))).body.items[0]?.qty ?? 0;
const profile = async () => (await http().get(`/api/v1/suppliers/${supplier}`).set(auth(ownerA)).expect(200)).body;
const purchase = (t: string, extra: any = {}) => http().post('/api/v1/purchases').set(auth(t)).send({
  supplierId: supplier, branchId: branchA, billDate: new Date().toISOString(), items: [{ productId: chain, qty: 5, unitCostPaise: 6_000_000 }], ...extra });
const adjustStock = (qty: number) => http().post('/api/v1/inventory/adjust').set(auth(admin))
  .send({ productId: chain, branchId: branchA, qty, note: 'test correction' }).expect(201);

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest9'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { SupplierLedger } = await import('../src/modules/suppliers/supplier.schema');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  supplierLedger = app.get(getModelToken(SupplierLedger.name));

  admin = await login('9876543210', 'Admin@12345');
  const br = async (code: string) => (await http().post('/api/v1/branches').set(auth(admin)).send({ code, name: code, invoicePrefix: code })).body._id;
  branchA = await br('RNC1'); branchB = await br('RNC2'); branchC = await br('RNC3');
  const mk = (n: string, m: string, r: string, b: string) =>
    http().post('/api/v1/users').set(auth(admin)).send({ name: n, mobile: m, password: 'Pass@12345', role: r, branchIds: [b] });
  await mk('Owner A', '9123456781', 'OWNER', branchA); await mk('Owner B', '9123456782', 'OWNER', branchB);
  await mk('Owner C', '9123456783', 'OWNER', branchC); await mk('Staff A', '9123456780', 'STAFF', branchA);
  ownerA = await login('9123456781', 'Pass@12345'); ownerB = await login('9123456782', 'Pass@12345');
  ownerC = await login('9123456783', 'Pass@12345'); staffA = await login('9123456780', 'Pass@12345');
  const cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold' })).body._id;
  const sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  chain = (await http().post('/api/v1/products').set(auth(admin)).send({ name: 'Gold Chain', categoryId: cat, subcategoryId: sub,
    metal: 'GOLD', karat: 22, grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM', makingValue: 50_000 })).body._id;
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Phase 7 – suppliers and purchases', () => {
  it('only owner/admin manage suppliers; duplicate mobile rejected', async () => {
    await http().post('/api/v1/suppliers').set(auth(staffA)).send({ name: 'Gold Traders' }).expect(403);
    const body = { name: 'Gold Traders', mobile: '9111111111', gstin: '20AAAAA0000A1Z5', address: 'Johari Bazaar' };
    supplier = (await http().post('/api/v1/suppliers').set(auth(ownerA)).send(body).expect(201)).body._id;
    await http().post('/api/v1/suppliers').set(auth(ownerA)).send({ ...body, name: 'Other' }).expect(409);
  });

  it('a purchase records the bill, adds stock and updates what we owe — in one step', async () => {
    const r = await purchase(ownerA, { billNo: 'GT-001', gstPaise: 900_000, payment: { amountPaise: 10_000_000, mode: 'UPI' } }).expect(201);
    expect(r.body).toMatchObject({ number: `RNC1-PU-${fy}-000001`, subtotalPaise: 30_000_000, totalPaise: 30_900_000, paidPaise: 10_000_000, status: 'ACTIVE' });
    expect(await stock(branchA)).toBe(5);
    const p = await profile();
    expect(p).toMatchObject({ balancePaise: 20_900_000, purchases: { count: 1, totalPaise: 30_900_000 } });
    const l = (await http().get(`/api/v1/suppliers/${supplier}/ledger`).set(auth(ownerA)).expect(200)).body.items;
    expect(l.map((e: any) => [e.kind, e.delta])).toEqual([['PAYMENT', -10_000_000], ['PURCHASE', 30_900_000]]);
    expect(l[0].voucherNo).toBe(`RNC1-SP-${fy}-000001`);
  });

  it('rejects bad purchases without leaving a trace', async () => {
    await purchase(ownerB).expect(403);                                                       // other branch
    await purchase(ownerA, { billNo: 'GT-001' }).expect(409);                                 // same supplier bill twice
    await purchase(ownerA, { billNo: 'GT-X', payment: { amountPaise: 99_000_000, mode: 'UPI' } }).expect(400);
    await purchase(ownerA, { items: [{ productId: new Types.ObjectId().toString(), qty: 1, unitCostPaise: 100 }] }).expect(400);
    await purchase(ownerA, { items: [{ productId: chain, qty: 0, unitCostPaise: 100 }] }).expect(400);
    await purchase(ownerA, { items: [{ qty: 1, unitCostPaise: 100 }] }).expect(400);          // no product, no description
    expect(await stock(branchA)).toBe(5);
    expect((await profile()).balancePaise).toBe(20_900_000);
  });

  it('supplier payments get voucher numbers; balance can go negative (advance)', async () => {
    const pay = (t: string, amountPaise: number, mode = 'CASH') =>
      http().post(`/api/v1/suppliers/${supplier}/payments`).set(auth(t)).send({ branchId: branchA, amountPaise, mode });
    await pay(staffA, 100).expect(403);
    expect((await pay(ownerA, 5_000_000).expect(201)).body).toMatchObject({ voucherNo: `RNC1-SP-${fy}-000002`, balancePaise: 15_900_000 });
    expect((await pay(ownerA, 15_900_000, 'BANK').expect(201)).body.balancePaise).toBe(0);
    expect((await pay(ownerA, 100_000, 'UPI').expect(201)).body.balancePaise).toBe(-100_000);
  });

  it('the ledger always adds up to the balance and cannot be edited', async () => {
    const l = (await http().get(`/api/v1/suppliers/${supplier}/ledger?limit=100`).set(auth(ownerA)).expect(200)).body.items;
    expect(l.reduce((s: number, e: any) => s + e.delta, 0)).toBe((await profile()).balancePaise);
    await expect(supplierLedger.updateOne({}, { delta: 1 })).rejects.toThrow('append-only');
    await expect(supplierLedger.deleteMany({})).rejects.toThrow('append-only');
  });

  it('cancelling a purchase (admin) reverses stock and the amount owed; refuses if the stock is gone', async () => {
    const p2 = (await purchase(ownerA, { billNo: 'GT-002', items: [{ productId: chain, qty: 2, unitCostPaise: 6_000_000 }] }).expect(201)).body._id;
    expect(await stock(branchA)).toBe(7);
    await http().post(`/api/v1/purchases/${p2}/cancel`).set(auth(ownerA)).send({ reason: 'wrong bill' }).expect(403);
    expect((await http().post(`/api/v1/purchases/${p2}/cancel`).set(auth(admin)).send({ reason: 'wrong bill' }).expect(201)).body.status).toBe('CANCELLED');
    expect(await stock(branchA)).toBe(5);
    expect((await profile()).balancePaise).toBe(-100_000);
    await http().post(`/api/v1/purchases/${p2}/cancel`).set(auth(admin)).send({ reason: 'again' }).expect(409);

    const p3 = (await purchase(ownerA, { billNo: 'GT-003', items: [{ productId: chain, qty: 2, unitCostPaise: 6_000_000 }] }).expect(201)).body._id;
    await adjustStock(-6);                                                                    // stock sold/moved elsewhere
    const bad = await http().post(`/api/v1/purchases/${p3}/cancel`).set(auth(admin)).send({ reason: 'oops' }).expect(400);
    expect(bad.body.message).toMatch(/already been sold or moved/);
    expect((await http().get(`/api/v1/purchases/${p3}`).set(auth(ownerA))).body.status).toBe('ACTIVE');
    expect((await profile()).balancePaise).toBe(11_900_000);                                  // nothing changed
    await adjustStock(6);
    await http().post(`/api/v1/purchases/${p3}/cancel`).set(auth(admin)).send({ reason: 'oops' }).expect(201);
    expect(await stock(branchA)).toBe(5);
    expect((await profile()).balancePaise).toBe(-100_000);
  });

  it('admin can correct the balance; owners cannot; lists respect the branch', async () => {
    const adj = (t: string) => http().post(`/api/v1/suppliers/${supplier}/adjustments`).set(auth(t)).send({ type: 'INCREASE', amountPaise: 100_000, reason: 'opening balance fix' });
    await adj(ownerA).expect(403);
    await adj(admin).expect(201);
    expect((await profile()).balancePaise).toBe(0);
    expect((await http().get('/api/v1/purchases').set(auth(ownerA)).expect(200)).body.total).toBe(3);
    expect((await http().get('/api/v1/purchases?status=ACTIVE').set(auth(ownerA)).expect(200)).body.total).toBe(1);
    expect((await http().get('/api/v1/purchases').set(auth(ownerB)).expect(200)).body.total).toBe(0);
  });
});

describe('Phase 7 – stock transfers', () => {
  const create = (t: string, extra: any = {}) => http().post('/api/v1/transfers').set(auth(t))
    .send({ fromBranchId: branchA, toBranchId: branchB, items: [{ productId: chain, qty: 2 }], ...extra });
  const act = (t: string, id: string, action: string, body: any = {}) => http().post(`/api/v1/transfers/${id}/${action}`).set(auth(t)).send(body);
  const get = async (id: string) => (await http().get(`/api/v1/transfers/${id}`).set(auth(admin)).expect(200)).body;
  let t1 = '';

  it('validates who may request what', async () => {
    await create(staffA).expect(403);                                    // no transfer permission
    await create(ownerC).expect(403);                                    // not their branches
    await create(ownerB, { toBranchId: branchA }).expect(400);           // same branch both sides
    expect((await create(ownerB, { items: [{ productId: chain, qty: 9 }] }).expect(400)).body.message).toMatch(/Not enough stock/);
  });

  it('PENDING → APPROVED → IN_TRANSIT → RECEIVED, stock moves at dispatch and at receipt', async () => {
    const c = await create(ownerB).expect(201);                          // destination asks for stock
    t1 = c.body._id;
    expect(c.body).toMatchObject({ number: `RNC1-TR-${fy}-000001`, status: 'PENDING' });
    await act(ownerB, t1, 'approve').expect(403);                        // only the source branch approves
    expect((await act(ownerA, t1, 'approve').expect(200)).body.status).toBe('APPROVED');
    await act(ownerB, t1, 'dispatch').expect(403);                       // only the source dispatches
    expect((await act(ownerA, t1, 'dispatch').expect(200)).body.status).toBe('IN_TRANSIT');
    expect([await stock(branchA), await stock(branchB)]).toEqual([3, 0]);   // left A, not yet in B
    expect((await http().get('/api/v1/transfers?status=IN_TRANSIT').set(auth(ownerB)).expect(200)).body.total).toBe(1);
    await act(ownerA, t1, 'receive').expect(403);                        // only the destination receives
    expect((await act(ownerB, t1, 'receive').expect(200)).body.status).toBe('RECEIVED');
    expect([await stock(branchA), await stock(branchB)]).toEqual([3, 2]);
    await act(ownerB, t1, 'receive').expect(409);                        // cannot receive twice
  });

  it('keeps a full history and is visible only to the two branches', async () => {
    expect((await get(t1)).history.map((h: any) => h.status)).toEqual(['PENDING', 'APPROVED', 'IN_TRANSIT', 'RECEIVED']);
    await http().get(`/api/v1/transfers/${t1}`).set(auth(ownerC)).expect(404);
    expect((await http().get('/api/v1/transfers').set(auth(ownerC)).expect(200)).body.total).toBe(0);
    const out = await http().get(`/api/v1/inventory/movements?type=TRANSFER_OUT&branchId=${branchA}`).set(auth(admin)).expect(200);
    const inn = await http().get(`/api/v1/inventory/movements?type=TRANSFER_IN&branchId=${branchB}`).set(auth(admin)).expect(200);
    expect([out.body.total, inn.body.total]).toEqual([1, 1]);
  });

  it('nobody but an admin approves their own request; cancelling after dispatch is refused', async () => {
    const t2 = (await create(ownerA, { items: [{ productId: chain, qty: 1 }] }).expect(201)).body._id;
    await act(ownerA, t2, 'approve').expect(403);
    await act(admin, t2, 'approve').expect(200);
    await act(ownerA, t2, 'dispatch').expect(200);
    await act(ownerA, t2, 'cancel', { reason: 'too late' }).expect(409);
    await act(ownerB, t2, 'receive').expect(200);
    expect([await stock(branchA), await stock(branchB)]).toEqual([2, 3]);
  });

  it('reject and cancel end the transfer before any stock moves', async () => {
    const t3 = (await create(ownerB, { items: [{ productId: chain, qty: 1 }] }).expect(201)).body._id;
    expect((await act(ownerA, t3, 'reject', { reason: 'needed here' }).expect(200)).body.status).toBe('REJECTED');
    await act(ownerA, t3, 'dispatch').expect(409);
    const t4 = (await create(ownerB, { items: [{ productId: chain, qty: 1 }] }).expect(201)).body._id;
    expect((await act(ownerB, t4, 'cancel', { reason: 'no longer needed' }).expect(200)).body.status).toBe('CANCELLED');
    await act(ownerA, t4, 'approve').expect(409);
    expect(await stock(branchA)).toBe(2);
  });

  it('dispatch is all-or-nothing: if stock vanished meanwhile, it stays APPROVED', async () => {
    const t5 = (await create(ownerB, { items: [{ productId: chain, qty: 2 }] }).expect(201)).body._id;
    await act(ownerA, t5, 'approve').expect(200);
    await adjustStock(-1);
    const r = await act(ownerA, t5, 'dispatch').expect(400);
    expect(r.body.message).toMatch(/Insufficient stock/);
    expect((await get(t5)).status).toBe('APPROVED');
    expect(await stock(branchA)).toBe(1);
    await act(ownerB, t5, 'cancel', { reason: 'stock short' }).expect(200);
  });
});
