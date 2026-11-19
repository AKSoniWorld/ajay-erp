import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

// Suppliers are settled in CASH and in FINE gold/silver. Purity: 24K = 100%, 22K = 91.6%, 18K = 75%.
// Cash ↔ fine conversions use the 24K gold / silver MARKET rate.
let app: INestApplication, mongo: MongoMemoryReplSet, ledgerModel: any;
let admin = '', owner = '', staff = '';
let branchA = '', chain = '', plate = '', supplier = '';
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (m: string, p: string) => (await http().post('/api/v1/auth/login').send({ mobile: m, password: p })).body.accessToken as string;
const profile = async () => (await http().get(`/api/v1/suppliers/${supplier}`).set(auth(owner)).expect(200)).body;
const bal = async () => { const b = (await profile()).balances; return [b.balancePaise, b.goldFineMg, b.silverFineMg]; };
const stock = async (id: string) =>
  (await http().get(`/api/v1/inventory?branchId=${branchA}&limit=100`).set(auth(admin))).body.items.find((i: any) => String(i.productId) === id)?.qty ?? 0;
const purchase = (extra: any) => http().post('/api/v1/purchases').set(auth(owner)).send({ supplierId: supplier, branchId: branchA, billDate: new Date().toISOString(), ...extra });
const pay = (t: string, body: any) => http().post(`/api/v1/suppliers/${supplier}/payments`).set(auth(t)).send({ branchId: branchA, mode: 'BANK', ...body });
const payMetal = (t: string, body: any) => http().post(`/api/v1/suppliers/${supplier}/metal-payments`).set(auth(t)).send({ branchId: branchA, ...body });
const convert = (t: string, body: any) => http().post(`/api/v1/suppliers/${supplier}/convert`).set(auth(t)).send(body);
const rate = (metal: string, karat: number | undefined, kind: string, r: number) =>
  http().post('/api/v1/rates').set(auth(admin)).send({ metal, ...(karat && { karat }), kind, ratePerGramPaise: r, reason: 'test rate' });

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest10'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { SupplierLedger } = await import('../src/modules/suppliers/supplier.schema');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();
  ledgerModel = app.get(getModelToken(SupplierLedger.name));

  admin = await login('9876543210', 'Admin@12345');
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1' })).body._id;
  const mk = (n: string, m: string, r: string) => http().post('/api/v1/users').set(auth(admin)).send({ name: n, mobile: m, password: 'Pass@12345', role: r, branchIds: [branchA] });
  await mk('Owner', '9123456781', 'OWNER'); await mk('Staff', '9123456780', 'STAFF');
  owner = await login('9123456781', 'Pass@12345'); staff = await login('9123456780', 'Pass@12345');
  const cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold' })).body._id;
  const sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  const base = { categoryId: cat, subcategoryId: sub, makingType: 'FLAT', makingValue: 0 };
  chain = (await http().post('/api/v1/products').set(auth(admin)).send({ ...base, name: 'Gold Chain', metal: 'GOLD', karat: 22, grossMg: 10_500, netMg: 10_000 })).body._id;
  plate = (await http().post('/api/v1/products').set(auth(admin)).send({ ...base, name: 'Silver Plate', metal: 'SILVER', purityPct: 92.5, grossMg: 100_000, netMg: 100_000 })).body._id;
  supplier = (await http().post('/api/v1/suppliers').set(auth(owner)).send({ name: 'Gold Traders', mobile: '9111111111' })).body._id;
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Purity table and market rates', () => {
  it('24K = 100%, 22K = 91.6%, 18K = 75% (default purity from karat)', async () => {
    const cats = (await http().get('/api/v1/categories').set(auth(admin))).body[0];
    const make = async (karat: number) => (await http().post('/api/v1/products').set(auth(admin)).send({ name: `Item ${karat}K`,
      categoryId: cats._id, subcategoryId: cats.children[0]._id, metal: 'GOLD', karat, grossMg: 1000, makingType: 'FLAT', makingValue: 0 }).expect(201)).body.purityPct;
    expect([await make(24), await make(22), await make(18)]).toEqual([100, 91.6, 75]);
  });
  it('the admin sets the 24K gold and silver MARKET rates', async () => {
    await rate('GOLD', 24, 'MARKET', 750_000).expect(201);                      // ₹7,500 per gram of fine gold
    const cur = (await http().get('/api/v1/rates/current').set(auth(owner)).expect(200)).body;
    expect(cur.GOLD_24K.MARKET.ratePerGramPaise).toBe(750_000);
    expect(cur.SILVER.MARKET).toBeNull();
  });
});

describe('Purchases settled in fine weight', () => {
  it('the purchase list names the supplier', async () => {
    await purchase({ items: [{ description: 'Packing', qty: 1, unitCostPaise: 1000 }] }).expect(201);
    const list = await http().get('/api/v1/purchases').set(auth(owner)).expect(200);
    expect(typeof list.body.items[0].supplierName).toBe('string');
  });
  it('gold item: owe fine = net × purity in metal, making + GST in cash', async () => {
    const r = await purchase({ billNo: 'B1', gstPaise: 4_500, items: [{ productId: chain, qty: 3, unitCostPaise: 50_000, settleInFine: true }] }).expect(201);
    expect(r.body).toMatchObject({ fineGoldMg: 27_480, fineSilverMg: 0, subtotalPaise: 150_000, totalPaise: 154_500 });   // 3 × 9,160 mg
    expect(await bal()).toEqual([154_500, 27_480, 0]);
    expect(await stock(chain)).toBe(3);
    const ledger = (await http().get(`/api/v1/suppliers/${supplier}/ledger?account=GOLD`).set(auth(owner)).expect(200)).body.items;
    expect(ledger).toHaveLength(1); expect(ledger[0]).toMatchObject({ account: 'GOLD', kind: 'PURCHASE', delta: 27_480 });
  });
  it('silver item; fine settlement is refused for non-metal lines', async () => {
    await purchase({ billNo: 'B2', items: [{ productId: plate, qty: 2, unitCostPaise: 10_000, settleInFine: true }] }).expect(201);   // 2 × 92,500 mg
    expect(await bal()).toEqual([174_500, 27_480, 185_000]);
    await purchase({ billNo: 'B3', items: [{ description: 'Packing', qty: 1, unitCostPaise: 100, settleInFine: true }] }).expect(400);
  });
});

describe('Settling with cash converted to fine, and with metal', () => {
  it('cash that settles fine gold/silver is converted at the market rate (rate must exist)', async () => {
    expect((await pay(owner, { amountPaise: 900_000, settles: 'SILVER' }).expect(400)).body.message).toMatch(/SILVER market rate not set/);
    await rate('SILVER', undefined, 'MARKET', 9_000).expect(201);               // ₹90 per gram
    const g = await pay(owner, { amountPaise: 7_500_000, settles: 'GOLD' }).expect(201);   // ₹75,000 ÷ ₹7,500/g = 10 g
    expect(g.body).toMatchObject({ fineMg: 10_000, rateGramPaise: 750_000, goldFineMg: 17_480, balancePaise: 174_500 });
    const s = await pay(owner, { amountPaise: 900_000, settles: 'SILVER' }).expect(201);   // ₹9,000 ÷ ₹90/g = 100 g
    expect(s.body).toMatchObject({ fineMg: 100_000, silverFineMg: 85_000 });
    const line = (await http().get(`/api/v1/suppliers/${supplier}/ledger?account=GOLD`).set(auth(owner))).body.items[0];
    expect(line).toMatchObject({ delta: -10_000, cashPaise: 7_500_000, rateGramPaise: 750_000, voucherNo: expect.stringContaining('-SP-') });
  });
  it('plain cash payment still reduces the cash owed', async () => {
    expect((await pay(owner, { amountPaise: 174_500 }).expect(201)).body.balancePaise).toBe(0);
    expect(await bal()).toEqual([0, 17_480, 85_000]);
  });
  it('metal payments from raw inventory: fine = net × purity; needs the stock; owner/admin only', async () => {
    await http().post('/api/v1/raw-inventory/adjust').set(auth(admin))
      .send({ branchId: branchA, metal: 'GOLD', type: 'ADJUST', netMg: 10_000, fineMg: 9_160, note: 'opening raw gold' }).expect(201);
    await payMetal(staff, { metal: 'GOLD', fineMg: 100 }).expect(403);
    const r = await payMetal(owner, { metal: 'GOLD', netMg: 5_000, purityPct: 91.6, fromRawInventory: true }).expect(201);
    expect(r.body).toMatchObject({ fineMg: 4_580, goldFineMg: 12_900 });
    const raw = (await http().get(`/api/v1/raw-inventory?branchId=${branchA}`).set(auth(owner))).body[0];
    expect(raw).toMatchObject({ netMg: 5_000, fineMg: 4_580 });
    await payMetal(owner, { metal: 'GOLD', netMg: 99_000, purityPct: 91.6, fromRawInventory: true }).expect(400);   // not enough raw metal
    await payMetal(owner, { metal: 'GOLD', fineMg: 100, fromRawInventory: true }).expect(400);                      // raw needs net + purity
    await payMetal(owner, { metal: 'GOLD' }).expect(400);
    expect((await profile()).balances.goldFineMg).toBe(12_900);                                                    // failures changed nothing
    expect((await payMetal(owner, { metal: 'GOLD', fineMg: 2_900 }).expect(201)).body.goldFineMg).toBe(10_000);
  });
});

describe('Rate cut: converting what we owe between cash and fine', () => {
  it('cash → fine and fine → cash at the market rate, only with enough balance', async () => {
    await purchase({ billNo: 'B4', items: [{ description: 'Labour', qty: 1, unitCostPaise: 7_500_000 }] }).expect(201);
    expect(await bal()).toEqual([7_500_000, 10_000, 85_000]);
    await convert(staff, { direction: 'CASH_TO_FINE', metal: 'GOLD', amountPaise: 100 }).expect(403);
    const a = await convert(owner, { direction: 'CASH_TO_FINE', metal: 'GOLD', amountPaise: 7_500_000 }).expect(201);
    expect(a.body).toMatchObject({ fineMg: 10_000, rateGramPaise: 750_000, balancePaise: 0, goldFineMg: 20_000 });
    expect((await convert(owner, { direction: 'CASH_TO_FINE', metal: 'GOLD', amountPaise: 750_000 }).expect(400)).body.message).toMatch(/Not enough balance/);
    const b = await convert(owner, { direction: 'FINE_TO_CASH', metal: 'GOLD', fineMg: 4_000 }).expect(201);   // 4 g × ₹7,500
    expect(b.body).toMatchObject({ amountPaise: 3_000_000, balancePaise: 3_000_000, goldFineMg: 16_000 });
    expect((await convert(owner, { direction: 'FINE_TO_CASH', metal: 'GOLD', fineMg: 999_999 }).expect(400)).body.message).toMatch(/Not enough balance/);
    expect(await bal()).toEqual([3_000_000, 16_000, 85_000]);
  });
  it('the profile values everything at today\'s market rates', async () => {
    const p = await profile();
    expect(p.marketRates).toEqual({ GOLD_24K: 750_000, SILVER: 9_000 });
    // cash 30,000 + gold 16 g × 7,500 (=1,20,000) + silver 85 g × 90 (=7,650) → ₹1,57,650 · in fine gold: 16 g + 4 g + 1.02 g
    expect(p.valuedAtMarket).toEqual({ totalCashPaise: 15_765_000, totalGoldFineMg: 21_020 });
  });
});

describe('Integrity', () => {
  it('each account’s ledger adds up to its balance and cannot be edited', async () => {
    const rows = await ledgerModel.find({ supplierId: supplier }).lean();
    const net = (a: string) => rows.filter((r: any) => r.account === a).reduce((s: number, r: any) => s + r.delta, 0);
    expect([net('CASH'), net('GOLD'), net('SILVER')]).toEqual(await bal());
    await expect(ledgerModel.updateOne({}, { delta: 1 })).rejects.toThrow('append-only');
  });
  it('cancelling a fine-weight purchase reverses the metal as well as the cash', async () => {
    const id = (await purchase({ billNo: 'B5', items: [{ productId: chain, qty: 1, unitCostPaise: 50_000, settleInFine: true }] }).expect(201)).body._id;
    expect(await bal()).toEqual([3_050_000, 25_160, 85_000]);
    expect(await stock(chain)).toBe(4);
    await http().post(`/api/v1/purchases/${id}/cancel`).set(auth(admin)).send({ reason: 'wrong bill' }).expect(201);
    expect(await bal()).toEqual([3_000_000, 16_000, 85_000]);
    expect(await stock(chain)).toBe(3);
  });
});
