import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { financialYearCode } from '../src/engines/numbering';

// Branch A: GST-registered → tax invoices.  Branch B: unregistered → bills of supply (no GST).
let app: INestApplication, mongo: MongoMemoryReplSet;
let admin = '', ownerA = '', staffA = '', staffB = '';
let branchA = '', branchB = '', chain = '', anita = '', bosInvoice = '';
const fy = financialYearCode();
const http = () => request(app.getHttpServer());
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const login = async (m: string, p: string) => (await http().post('/api/v1/auth/login').send({ mobile: m, password: p })).body.accessToken as string;
const binary = (res: any, cb: any) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); };
const quote = (t: string, branchId: string, extra: any = {}) =>
  http().post('/api/v1/pos/quote').set(auth(t)).send({ branchId, lines: [{ productId: chain }], ...extra });
const draft = (t: string, branchId: string) =>
  http().post('/api/v1/pos/invoices').set(auth(t)).send({ branchId, customerId: anita, lines: [{ productId: chain }] });
const finalize = (t: string, id: string, amountPaise: number) =>
  http().post(`/api/v1/pos/invoices/${id}/finalize`).set(auth(t)).send({ payments: [{ mode: 'UPI', amountPaise }] });
const patchBranch = (id: string, body: any, t = admin) => http().patch(`/api/v1/branches/${id}`).set(auth(t)).send(body);

// 10 g @ ₹7,000 + ₹5,000 making = ₹75,000. With GST (3%) ₹77,250; as a bill of supply ₹75,000.
const WITH_GST = 7_725_000, NO_GST = 7_500_000;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGO_URI: mongo.getUri('ajaytest8'), JWT_ACCESS_SECRET: 'test-secret-test-secret',
    ADMIN_MOBILE: '9876543210', ADMIN_PASSWORD: 'Admin@12345', LOGIN_RATE_LIMIT: '1000', PDF_FONT_DIR: '/nonexistent',
  });
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication(); configureApp(app); await app.init();

  admin = await login('9876543210', 'Admin@12345');
  branchA = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'RNC1', name: 'Main', invoicePrefix: 'RNC1',
    gstin: '20ABCDE1234F1Z5', address: 'Main Road, Ranchi', state: 'Jharkhand' })).body._id;
  branchB = (await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'UNR1', name: 'Small Shop', invoicePrefix: 'UNR1',
    address: 'Market Road, Ranchi', state: 'Jharkhand', gstRegistered: false })).body._id;
  const mk = (n: string, m: string, p: string, r: string, b: string) =>
    http().post('/api/v1/users').set(auth(admin)).send({ name: n, mobile: m, password: p, role: r, branchIds: [b] });
  await mk('Owner A', '9123456781', 'Owner@12345', 'OWNER', branchA);
  await mk('Staff A', '9123456780', 'Staff@12345', 'STAFF', branchA);
  await mk('Staff B', '9123456782', 'Staff@12345', 'STAFF', branchB);
  ownerA = await login('9123456781', 'Owner@12345'); staffA = await login('9123456780', 'Staff@12345'); staffB = await login('9123456782', 'Staff@12345');
  const cat = (await http().post('/api/v1/categories').set(auth(admin)).send({ name: 'Gold' })).body._id;
  const sub = (await http().post('/api/v1/subcategories').set(auth(admin)).send({ name: 'Chains', categoryId: cat })).body._id;
  chain = (await http().post('/api/v1/products').set(auth(admin)).send({ name: 'Gold Chain', categoryId: cat, subcategoryId: sub,
    metal: 'GOLD', karat: 22, grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM', makingValue: 50_000 })).body._id;
  for (const b of [branchA, branchB])
    await http().post('/api/v1/inventory/adjust').set(auth(admin)).send({ productId: chain, branchId: b, qty: 10, type: 'OPENING' });
  await http().post('/api/v1/rates').set(auth(admin)).send({ metal: 'GOLD', karat: 22, kind: 'SALE', ratePerGramPaise: 700_000, reason: 'test rate' });
  anita = (await http().post('/api/v1/customers').set(auth(staffA)).send({ name: 'Anita', mobile: '9000000001' })).body._id;
});
afterAll(async () => { await app?.close(); await mongo?.stop(); });

describe('Invoice type follows the branch registration', () => {
  it('a registered branch charges GST; an unregistered branch charges none', async () => {
    expect((await quote(staffA, branchA).expect(200)).body.totals).toMatchObject({ gst: 225_000, cgst: 112_500, sgst: 112_500, finalPayable: WITH_GST });
    expect((await quote(staffB, branchB).expect(200)).body.totals)
      .toMatchObject({ gst: 0, cgst: 0, sgst: 0, grossTotal: NO_GST, finalPayable: NO_GST, roundOff: 0 });
  });
  it('allows GST or without-GST choice on a registered branch', async () => {
    const nonGst = await quote(staffA, branchA, { taxMode: 'NON_GST' }).expect(200);
    expect(nonGst.body).toMatchObject({
      taxMode: 'NON_GST',
      totals: { gst: 0, cgst: 0, sgst: 0, finalPayable: NO_GST },
    });
    await quote(staffB, branchB, { taxMode: 'GST' }).expect(400);
  });
  it('registration rules: unregistered ⇒ no GSTIN; registered-after ⇒ GSTIN required; admin only', async () => {
    await http().post('/api/v1/branches').set(auth(admin)).send({ code: 'BAD1', name: 'x', invoicePrefix: 'BAD1', gstRegistered: false, gstin: '20ABCDE1234F1Z5' }).expect(400);
    await patchBranch(branchA, { gstRegistered: false }).expect(400);                  // A still has its GSTIN
    await patchBranch(branchB, { gstRegistered: true }).expect(400);                   // B has no GSTIN
    await patchBranch(branchB, { gstRegistered: false }, ownerA).expect(403);          // owners cannot change it
  });
});

describe('Numbering, documents and filters', () => {
  it('each type has its own series', async () => {
    const a = await finalize(staffA, (await draft(staffA, branchA).expect(201)).body._id, WITH_GST).expect(200);
    expect(a.body).toMatchObject({ taxMode: 'GST', number: `RNC1-${fy}-000001` });
    const d = await draft(staffB, branchB).expect(201);
    expect(d.body.taxMode).toBe('NON_GST');
    const b = await finalize(staffB, d.body._id, NO_GST).expect(200);
    bosInvoice = d.body._id;
    expect(b.body).toMatchObject({ taxMode: 'NON_GST', status: 'FINAL', number: `UNR1-BS-${fy}-000001` });
    expect(b.body.totals).toMatchObject({ gst: 0, finalPayable: NO_GST });
    expect((await http().get(`/api/v1/pos/invoices/${bosInvoice}/verify`).set(auth(admin))).body.ok).toBe(true);
  });
  it('customer copy and PDF are a bill of supply with no tax', async () => {
    const v = (await http().get(`/api/v1/pos/invoices/${bosInvoice}/customer-view`).set(auth(staffB)).expect(200)).body;
    expect(v.document).toMatchObject({ taxMode: 'NON_GST', number: `UNR1-BS-${fy}-000001` });
    expect(v).toMatchObject({ gst: { total: 0 }, netPayable: NO_GST });
    const pdf = await http().get(`/api/v1/pos/invoices/${bosInvoice}/pdf`).set(auth(staffB)).buffer(true).parse(binary).expect(200);
    expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('records of the two types are kept apart and branches only see their own', async () => {
    const q = async (t: string, mode: string) =>
      (await http().get(`/api/v1/pos/invoices?taxMode=${mode}&status=FINAL&type=SALE`).set(auth(t)).expect(200)).body.total;
    expect(await q(admin, 'NON_GST')).toBe(1);
    expect(await q(admin, 'GST')).toBe(1);
    expect(await q(ownerA, 'NON_GST')).toBe(0);      // branch A never sees branch B's bills
  });
});

describe('Registration changes', () => {
  it('keeps a draft tax choice when branch registration changes', async () => {
    const id = (await draft(staffB, branchB).expect(201)).body._id;
    expect((await http().get(`/api/v1/pos/invoices/${id}`).set(auth(staffB))).body.taxMode).toBe('NON_GST');

    await patchBranch(branchB, { gstRegistered: true, gstin: '20ABCDE1234F1Z5' }).expect(200);

    const finalized = await finalize(staffB, id, NO_GST).expect(200);
    expect(finalized.body).toMatchObject({
      taxMode: 'NON_GST',
      status: 'FINAL',
      number: `UNR1-BS-${fy}-000002`,
      totals: { gst: 0, finalPayable: NO_GST },
    });

    const defaultQuote = await quote(staffB, branchB).expect(200);
    expect(defaultQuote.body).toMatchObject({
      taxMode: 'GST',
      totals: { gst: 225_000, finalPayable: WITH_GST },
    });

    const noGstQuote = await quote(staffB, branchB, { taxMode: 'NON_GST' }).expect(200);
    expect(noGstQuote.body).toMatchObject({
      taxMode: 'NON_GST',
      totals: { gst: 0, finalPayable: NO_GST },
    });
  });
  it('old bills keep their type, and so do their credit notes', async () => {
    const cn = await http().post(`/api/v1/pos/invoices/${bosInvoice}/credit-note`).set(auth(admin))
      .send({ reason: 'return', refunds: [{ mode: 'UPI', amountPaise: NO_GST }] }).expect(201);
    expect(cn.body).toMatchObject({ type: 'CREDIT_NOTE', taxMode: 'NON_GST', number: `UNR1-BS-CN-${fy}-000001` });
    expect(cn.body.totals).toMatchObject({ gst: 0, finalPayable: -NO_GST });
  });
});
