import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

// Branch A (GST-registered "Main") and branch B (unregistered "Small Shop", bills of supply).
// S1 ₹77,250 (A) · S2 ₹17,699 with old gold (A) · credit note on S1 · S3 ₹75,000 bill of supply (B) · dairy ₹3,000 · supplier purchase.
let app: INestApplication, mongo: MongoMemoryReplSet;
let admin = '', ownerA = '', staffA = '', staffB = '';
let branchA = '', branchB = '', chain = '', anita = '', s2Number = '', supplier = '';
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (m: string, p: string) => (await http().post('/api/v1/auth/login').send({ mobile: m, password: p })).body.accessToken as string;
const binary = (res: any, cb: any) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); };
const get = (path: string, t = admin) => http().get(`/api/v1${path}`).set(auth(t));
const sale = async (t: string, branchId: string, payable: number, extra: any = {}) => {
  const d = (await http().post('/api/v1/pos/invoices').set(auth(t)).send({ branchId, customerId: anita, lines: [{ productId: chain }], ...extra }).expect(201)).body;
  const f = await http().post(`/api/v1/pos/invoices/${d._id}/finalize`).set(auth(t)).send({ payments: [{ mode: 'UPI', amountPaise: payable }] }).expect(200);
  return f.body;
};
let s1 = '';

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest11'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000', PDF_FONT_DIR: '/nonexistent',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();

  admin = await login('9876543210', 'Admin@12345');
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1', gstin: '20ABCDE1234F1Z5' })).body._id;
  branchB = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'UNR1', name: 'Small Shop', invoicePrefix: 'UNR1', gstRegistered: false })).body._id;
  const mk = (n: string, m: string, r: string, b: string) => http().post('/api/v1/users').set(auth(admin)).send({ name: n, mobile: m, password: 'Pass@12345', role: r, branchIds: [b] });
  await mk('Owner A', '9123456781', 'OWNER', branchA); await mk('Staff A', '9123456780', 'STAFF', branchA); await mk('Staff B', '9123456782', 'STAFF', branchB);
  ownerA = await login('9123456781', 'Pass@12345'); staffA = await login('9123456780', 'Pass@12345'); staffB = await login('9123456782', 'Pass@12345');
  const cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold' })).body._id;
  const sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  chain = (await http().post('/api/v1/products').set(auth(admin)).send({ name: 'Gold Chain', categoryId: cat, subcategoryId: sub,
    metal: 'GOLD', karat: 22, grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM', makingValue: 50_000 })).body._id;
  for (const b of [branchA, branchB]) await http().post('/api/v1/inventory/adjust').set(auth(admin)).send({ productId: chain, branchId: b, qty: 10, type: 'OPENING' });
  await http().post('/api/v1/rates').set(auth(admin)).send({ metal: 'GOLD', karat: 22, kind: 'SALE', ratePerGramPaise: 700_000, reason: 'test rate' });
  await http().post('/api/v1/rates').set(auth(admin)).send({ metal: 'GOLD', karat: 22, kind: 'EXCHANGE', ratePerGramPaise: 650_123, reason: 'test rate' });
  anita = (await http().post('/api/v1/customers').set(auth(staffA)).send({ name: 'Anita', mobile: '9000000001' })).body._id;

  s1 = (await sale(staffA, branchA, 7_725_000))._id;
  const s2 = await sale(staffA, branchA, 1_769_900, { exchanges: [{ metal: 'GOLD', grossMg: 10_500, lessMg: 500, purityPct: 91.6 }] });
  s2Number = s2.number;
  await http().post(`/api/v1/pos/invoices/${s1}/credit-note`).set(auth(ownerA)).send({ reason: 'return', refunds: [{ mode: 'UPI', amountPaise: 7_725_000 }] }).expect(201);
  await sale(staffB, branchB, 7_500_000);
  const scheme = (await http().post('/api/v1/dairy/schemes').set(auth(ownerA)).send({ customerId: anita, branchId: branchA,
    startDate: new Date().toISOString(), monthlyPaise: 100_000, durationMonths: 11, type: 'BONUS' })).body._id;
  await http().post(`/api/v1/dairy/schemes/${scheme}/payments`).set(auth(staffA)).send({ amountPaise: 300_000, mode: 'UPI' }).expect(201);
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Sales report (daily / monthly, GST and no-GST kept apart)', () => {
  it('groups by day, branch and bill type; returns are netted off', async () => {
    const r = (await get('/reports/sales').expect(200)).body;
    expect(r.rows).toHaveLength(2);
    expect(r.rows.find((x: any) => x.taxMode === 'GST')).toMatchObject({ branch: 'Main', invoices: 2, salesPaise: 9_494_900, returnsPaise: 7_725_000,
      netPaise: 1_769_900, gstPaise: 225_000, exchangePaise: 5_955_127 });
    expect(r.rows.find((x: any) => x.taxMode === 'NON_GST')).toMatchObject({ branch: 'Small Shop', invoices: 1, salesPaise: 7_500_000, gstPaise: 0 });
    expect(r.totals).toMatchObject({ invoices: 3, salesPaise: 16_994_900, returnsPaise: 7_725_000, netPaise: 9_269_900 });
  });
  it('can be filtered by bill type and shown monthly', async () => {
    expect((await get('/reports/sales?taxMode=NON_GST')).body.rows).toHaveLength(1);
    expect((await get('/reports/sales?taxMode=GST')).body.rows).toHaveLength(1);
    expect((await get('/reports/sales?granularity=month')).body.rows[0].period).toMatch(/^\d{4}-\d{2}$/);
  });
  it('staff see only their own sales; owners only their branches', async () => {
    const a = (await get('/reports/sales', staffA).expect(200)).body;
    expect(a.rows).toHaveLength(1); expect(a.totals).toMatchObject({ invoices: 2, returnsPaise: 0, netPaise: 9_494_900 });   // the credit note was made by the owner
    expect((await get('/reports/sales', staffB)).body.rows[0].taxMode).toBe('NON_GST');
    const o = (await get('/reports/sales', ownerA)).body;
    expect(o.rows).toHaveLength(1); expect(o.totals).toMatchObject({ invoices: 2, returnsPaise: 7_725_000 });
  });
  it('exports to CSV (rupees, Excel-friendly) and PDF', async () => {
    const csv = await get('/reports/sales?format=csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.startsWith('\uFEFFDate,Branch,Type,Bills,Sales,Returns')).toBe(true);
    expect(csv.text).toContain('94949.00'); expect(csv.text).toContain('TOTAL');
    const pdf = await get('/reports/sales?format=pdf').buffer(true).parse(binary).expect(200);
    expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('validates dates and enforces who may run what', async () => {
    await get('/reports/sales?from=2026-13-45&to=2026-13-46').expect(400);
    await get('/reports/sales?from=2026-10-10&to=2026-10-01').expect(400);
    await get('/reports/sales?from=2020-01-01&to=2026-10-01').expect(400);        // over 366 days
    await get('/reports/old-gold', staffA).expect(403);
    await get('/reports/branch-comparison', ownerA).expect(403);
    await get('/dashboard/head-office', ownerA).expect(403);
  });
});

describe('Branch comparison', () => {
  it('ranks branches and splits GST from no-GST sales', async () => {
    const r = (await get('/reports/branch-comparison').expect(200)).body;
    expect(r.rows.map((x: any) => x.branch)).toEqual(['Small Shop', 'Main']);
    expect(r.rows[0]).toMatchObject({ invoices: 1, netPaise: 7_500_000, netNonGstPaise: 7_500_000, netGstPaise: 0, stockPieces: 9, dairyCollectedPaise: 0 });
    expect(r.rows[1]).toMatchObject({ invoices: 2, netPaise: 1_769_900, netGstPaise: 1_769_900, netNonGstPaise: 0, stockPieces: 9, dairyCollectedPaise: 300_000, exchangePaise: 5_955_127 });
    expect(r.totals).toMatchObject({ invoices: 3, netPaise: 9_269_900 });
  });
});

describe('Old gold / silver, dairy collection, stock movement', () => {
  it('old gold: every item with weights, fine and rate; plus the raw stock now', async () => {
    const r = (await get('/reports/old-gold', ownerA).expect(200)).body;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ invoiceNumber: s2Number, branch: 'Main', customer: 'Anita', grossMg: 10_500, lessMg: 500, netMg: 10_000,
      purityPct: 91.6, fineMg: 9_160, ratePerGramPaise: 650_123, valuePaise: 5_955_127 });
    expect(r.totals).toMatchObject({ netMg: 10_000, fineMg: 9_160, valuePaise: 5_955_127 });
    expect(r.meta.rawStockNow).toEqual([{ branch: 'Main', netMg: 10_000, fineMg: 9_160 }]);
    expect((await get('/reports/old-silver').expect(200)).body.rows).toHaveLength(0);
  });
  it('dairy collection', async () => {
    const r = (await get('/reports/dairy-collection', ownerA).expect(200)).body;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ branch: 'Main', customer: 'Anita', mode: 'UPI', monthsCovered: 3, amountPaise: 300_000 });
    expect(r.meta.byMode).toEqual({ UPI: 300_000 });
  });
  it('stock movement: opening, sales and the return, with net quantities', async () => {
    const r = (await get('/reports/stock-movement').expect(200)).body;
    expect(r.rows).toHaveLength(6);
    expect(r.totals.qty).toBe(18); expect(r.meta.netQtyByType).toEqual({ OPENING: 20, SALE: -3, RETURN: 1 });
    expect((await get('/reports/stock-movement?type=SALE')).body.rows).toHaveLength(3);
    expect((await get(`/reports/stock-movement?branchId=${branchA}`)).body.rows).toHaveLength(4);
  });
});

describe('Customer and supplier ledgers', () => {
  it('customer ledger shows every kind of entry, separately', async () => {
    const r = (await get(`/reports/customer-ledger?customerId=${anita}`).expect(200)).body;
    const kinds = r.rows.map((x: any) => x.kind).sort();
    expect(kinds).toEqual(['DAIRY_DEPOSIT', 'OLD_METAL', 'PURCHASE', 'PURCHASE', 'PURCHASE', 'RETURN']);
    expect(r.rows.find((x: any) => x.kind === 'OLD_METAL')).toMatchObject({ amountPaise: 5_955_127, fineGoldMg: 9_160 });
    expect(r.meta).toMatchObject({ purchasesPaise: 16_994_900, returnsPaise: 7_725_000, netPurchasesPaise: 9_269_900, dairyDepositsPaise: 300_000 });
    await get('/reports/customer-ledger').expect(400);                                          // customerId required
    const own = (await get(`/reports/customer-ledger?customerId=${anita}`, ownerA)).body;       // owner: branch A only
    expect(own.rows).toHaveLength(5); expect(own.meta.purchasesPaise).toBe(9_494_900);
  });
  it('supplier ledger: cash and metal accounts', async () => {
    supplier = (await http().post('/api/v1/suppliers').set(auth(ownerA)).send({ name: 'Gold Traders', mobile: '9111111111' })).body._id;
    await http().post('/api/v1/purchases').set(auth(ownerA)).send({ supplierId: supplier, branchId: branchA, billDate: new Date().toISOString(),
      items: [{ productId: chain, qty: 2, unitCostPaise: 6_000_000 }], payment: { amountPaise: 5_000_000, mode: 'UPI' } }).expect(201);
    const r = (await get(`/reports/supplier-ledger?supplierId=${supplier}`, ownerA).expect(200)).body;
    expect(r.rows.map((x: any) => [x.kind, x.account, x.cashDeltaPaise])).toEqual([['PURCHASE', 'CASH', 12_000_000], ['PAYMENT', 'CASH', -5_000_000]]);
    expect(r.meta.netChange).toEqual({ cashPaise: 7_000_000, goldFineMg: 0, silverFineMg: 0 });
    expect((await get(`/reports/supplier-ledger?supplierId=${supplier}&account=GOLD`)).body.rows).toHaveLength(0);
    await get('/reports/supplier-ledger').expect(400);
  });
});

describe('Head-office dashboard', () => {
  it('shows sales, stock, dairy, old metal and balances across all branches', async () => {
    const d = (await get('/dashboard/head-office').expect(200)).body;
    expect(d.sales.period.total).toMatchObject({ invoices: 3, salesPaise: 16_994_900, returnsPaise: 7_725_000, netPaise: 9_269_900, gstPaise: 225_000 });
    expect(d.sales.period.byTaxMode.GST.netPaise).toBe(1_769_900);
    expect(d.sales.period.byTaxMode.NON_GST.netPaise).toBe(7_500_000);
    expect(d.sales.period.byBranch.map((b: any) => b.branch)).toEqual(['Small Shop', 'Main']);
    expect(d.sales.today.total.netPaise).toBe(9_269_900);
    expect(d.stock.totalPieces).toBe(20);                                         // Main 11 (after the supplier purchase) + Small Shop 9
    expect(d.stock.inTransit).toEqual({ transfers: 0, pieces: 0 });
    expect(d.stock.rawMetal).toEqual([expect.objectContaining({ branch: 'Main', metal: 'GOLD', netMg: 10_000, fineMg: 9_160 })]);
    expect(d.dairy).toMatchObject({ balancePaise: 300_000, schemes: { total: 1, byStatus: { ACTIVE: 1 }, withBalance: 1 }, collected: { totalPaise: 300_000, byMode: { UPI: 300_000 } } });
    expect(d.exchange).toMatchObject({ goldFineMg: 9_160, silverFineMg: 0, valuePaise: 5_955_127 });
    expect(d.accounts).toMatchObject({ customerAdvancePaise: 0, customerDuePaise: 0, supplierPayable: { cashPaise: 7_000_000, goldFineMg: 0, silverFineMg: 0 } });
  });
});
