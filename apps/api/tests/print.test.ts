import { describe, expect, it } from '@jest/globals';
import { calculate, toCustomerInvoice } from '../src/engines/pricing.engine';
import { priceExchangeItems } from '../src/engines/exchange';
import { buildInvoiceDoc, buildReceiptDoc } from '../src/modules/print/docs';
import { escposTag, tsplTag, TagLabel } from '../src/modules/print/tags';

const o = { symbol: 'Rs.', font: 'Helvetica' };
function view(display?: 'AMOUNT' | 'AMOUNT_AND_FINE_WEIGHT') {
  const [ex] = priceExchangeItems([{ metal: 'GOLD', grossMg: 10_500, lessMg: 500, purityPct: 91.6 }], { GOLD_22K: { ratePerGramPaise: 650_123 } });
  const lines = [{ name: 'Gold Chain', sku: 'G-000001', metalValue: 7_000_000, making: 500_000, hsn: '7113', qty: 1, karat: 22, purityPct: 91.6, grossMg: 10_500, netMg: 10_000 }];
  const r = calculate({ lines, exchanges: [ex], dairyAdjustment: 100_000, dairyAvailable: 100_000 });
  return {
    document: { number: 'RNC1-2627-000001', type: 'SALE', status: 'FINAL', date: new Date('2026-10-26T06:00:00Z') },
    branch: { name: 'Ajay Jewellers - Main', address: 'Main Road, Ranchi', gstin: '20ABCDE1234F1Z5', state: 'Jharkhand' },
    customer: { name: 'Anita', mobile: '9000000001', address: 'Ranchi' },
    ...toCustomerInvoice(r, lines, { customer: 'Anita' }, display ? { exchangeDisplay: display, goldFineMg: ex.fineMg } : {}),
  };
}
const text = (d: any) => JSON.stringify(d);

describe('A4 invoice document', () => {
  it('carries the GST fields and the amount rows in the right order', () => {
    const t = text(buildInvoiceDoc(view(), o));
    for (const s of ['TAX INVOICE', 'RNC1-2627-000001', '20ABCDE1234F1Z5', 'Jharkhand (20)', 'CGST @ 1.5%', 'SGST @ 1.5%',
      'Less: Old Gold Exchange', 'Less: Dairy Adjustment', 'Round off', 'NET PAYABLE', 'Rs. 16,699.00',
      'Rupees Sixteen Thousand Six Hundred Ninety Nine Only']) expect(t).toContain(s);
    expect(t.indexOf('Old Gold Exchange')).toBeLessThan(t.indexOf('Dairy Adjustment'));
    expect(t.indexOf('Dairy Adjustment')).toBeLessThan(t.indexOf('NET PAYABLE'));
  });
  it('never exposes old-metal weights/rates or dairy details', () => {
    const t = text(buildInvoiceDoc(view(), o));
    expect(t).not.toMatch(/fineMg|lessMg|ratePerGram|exchangeDetail|schemeId|schemeNo|ledger/i);
    expect(t).not.toContain('Jama'); expect(t).not.toContain('fine weight');
  });
  it('optionally shows only the total fine weight (jama)', () => {
    const t = text(buildInvoiceDoc(view('AMOUNT_AND_FINE_WEIGHT'), o));
    expect(t).toContain('Old Gold Jama (fine weight)'); expect(t).toContain('9.160 g');
    expect(t).not.toMatch(/lessMg|ratePerGram|exchangeDetail/);
  });
  it('uses the ₹ sign when the font has it', () => expect(text(buildInvoiceDoc(view(), { symbol: '₹', font: 'NotoSans' }))).toContain('₹ 16,699.00'));
  it('draft gets a watermark; credit note is titled and references the invoice', () => {
    const d = view(); (d.document as any).status = 'DRAFT';
    expect(text(buildInvoiceDoc(d, { ...o, draft: true }))).toMatch(/DRAFT INVOICE.*watermark|watermark.*DRAFT INVOICE/s);
    const c: any = view(); c.document.type = 'CREDIT_NOTE'; c.document.againstInvoice = 'RNC1-2627-000009';
    const t = text(buildInvoiceDoc(c, o));
    expect(t).toContain('CREDIT NOTE'); expect(t).toContain('Against invoice: RNC1-2627-000009');
  });
});

describe('receipt document', () => {
  it('shows number, amount and words', () => {
    const t = text(buildReceiptDoc({ title: 'ADVANCE RECEIPT', receiptNo: 'RNC1-AR-2627-000001', date: new Date(),
      branch: { name: 'Main' }, customer: { name: 'Anita' }, rows: [['Payment mode', 'UPI']], amountPaise: 2_000_000 }, o));
    expect(t).toContain('RNC1-AR-2627-000001'); expect(t).toContain('Rs. 20,000.00'); expect(t).toContain('Rupees Twenty Thousand Only');
  });
});

describe('paper size (A4 / A5)', () => {
  const rec = { title: 'ADVANCE RECEIPT', receiptNo: 'RNC1-AR-2627-000002', date: new Date(), branch: { name: 'Main', address: 'Ranchi' },
    customer: { name: 'Anita' }, rows: [['Payment mode', 'CASH']] as [string, string][], amountPaise: 500_000 };
  it('bills default to A4 and can be printed on A5 (half of A4)', () => {
    expect(buildInvoiceDoc(view(), o).pageSize).toBe('A4');
    const a5: any = buildInvoiceDoc(view(), { ...o, paper: 'A5' });
    expect(a5.pageSize).toBe('A5');
    expect(text(a5)).toContain('16,699.00');          // same content, smaller page
  });
  it('receipts default to A5 and can be printed on A4', () => {
    expect(buildReceiptDoc(rec, o).pageSize).toBe('A5');
    const a4: any = buildReceiptDoc(rec, { ...o, paper: 'A4' });
    expect(a4.pageSize).toBe('A4');
    expect(text(a4)).toContain('5,000.00');
  });
  it('an A5 bill still never shows old-metal weights or rates', () => {
    const t = text(buildInvoiceDoc(view(), { ...o, paper: 'A5' }));
    expect(t).not.toMatch(/purity|91\.6|less weight/i);
  });
});

describe('thermal tags', () => {
  const label: TagLabel = { shortName: 'Gold Chain', sku: 'G-000001', grade: '22K', gross: '10.500', net: '10.000', branchName: 'Main', qr: 'AJ:G-000001' };
  const count = (b: Buffer, s: string) => b.toString('latin1').split(s).length - 1;
  it('ESC/POS: init per label, QR payload only (no barcode), label feed', () => {
    const b = escposTag(label, '40x25', 3);
    expect(count(b, '\x1b@')).toBe(3);
    expect(b.includes(Buffer.from('AJ:G-000001', 'latin1'))).toBe(true);
    expect(b.includes(Buffer.from([0x1d, 0x6b]))).toBe(false);          // no barcode command (GS k)
  });
  it('TSPL: label size, QR (no barcode), copies', () => {
    const t = tsplTag(label, '40x25', 3).toString('latin1');
    for (const s of ['SIZE 40 mm,25 mm', 'QRCODE', '"AJ:G-000001"', 'PRINT 1,3']) expect(t).toContain(s);
    expect(t).not.toContain('BARCODE');
    expect(tsplTag(label, '50x25').toString('latin1')).toContain('SIZE 50 mm,25 mm');
  });
  it('cleans quotes and non-ASCII so a command can never be broken', () => {
    const t = tsplTag({ ...label, shortName: 'Ring "X" ✓ केस' }, '40x25').toString('latin1');
    expect(t).toContain(`"Ring 'X'  "`.slice(0, 9));
    expect(t).not.toMatch(/[^\x00-\x7f]/);
  });
});

describe('bill of supply (no GST) document', () => {
  function nonGstView(type = 'SALE') {
    const lines = [{ name: 'Silver Plate', sku: 'S-000001', metalValue: 500_000, making: 50_000, hsn: '7113', qty: 1 }];
    const r = calculate({ lines, gstRatePct: 0 });
    return { document: { number: 'RNC1-BS-2627-000001', type, status: 'FINAL', taxMode: 'NON_GST', date: new Date() },
      branch: { name: 'Main', address: 'Ranchi', state: 'Jharkhand' }, customer: { name: 'Anita' },
      ...toCustomerInvoice(r, lines, { customer: 'Anita' }) };
  }
  it('is titled a bill of supply, charges no GST and shows no tax rows', () => {
    const t = text(buildInvoiceDoc(nonGstView(), o));
    for (const s of ['BILL OF SUPPLY', 'No GST has been charged', 'RNC1-BS-2627-000001', 'Total', 'Rs. 5,500.00']) expect(t).toContain(s);
    for (const s of ['CGST', 'SGST', 'TAX INVOICE', 'Place of supply', 'GSTIN', 'Taxable value']) expect(t).not.toContain(s);
  });
  it('its credit note says so', () => expect(text(buildInvoiceDoc(nonGstView('CREDIT_NOTE'), o))).toContain('CREDIT NOTE (BILL OF SUPPLY)'));
  it('a GST invoice is unchanged (still a TAX INVOICE with CGST/SGST)', () => {
    const t = text(buildInvoiceDoc(view(), o));
    expect(t).toContain('TAX INVOICE'); expect(t).toContain('CGST'); expect(t).not.toContain('BILL OF SUPPLY');
  });
});
