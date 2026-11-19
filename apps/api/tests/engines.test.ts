import { describe, it, expect } from '@jest/globals';
import { calculate, toCustomerInvoice } from '../src/engines/pricing.engine';
import { dairyStatus } from '../src/engines/dairy.engine';

const lines = [{ name: 'Chain', sku: 'G-001', metalValue: 5_000_000, making: 500_000 }];
const ex = [{ metal: 'GOLD' as const, grossMg: 5_500, lessMg: 500, purityPct: 91.6, ratePerGramPaise: 700_000 }];

describe('pricing', () => {
  it('applies order: jewellery+making+GST - exchange - dairy', () => {
    const r = calculate({ lines, exchanges: ex, dairyAdjustment: 100_000, dairyAvailable: 200_000 });
    expect(r.gst).toBe(165_000);
    expect(r.goldExchange).toBe(3_206_000); // fine 4.580 g (5 g × 91.6%) × ₹7,000
    expect(r.subtotal).toBe(2_459_000);
    expect(r.finalPayable).toBe(2_359_000);
  });
  it('customer invoice never leaks weights, rates or purity', () => {
    const r = calculate({ lines, exchanges: ex });
    const json = JSON.stringify(toCustomerInvoice(r, lines, { customer: 'X' }));
    for (const k of ['grossMg', 'lessMg', 'netMg', 'ratePerGram', 'purity']) expect(json).not.toContain(k);
  });
  it('rejects dairy above ledger balance', () => {
    expect(() => calculate({ lines, dairyAdjustment: 1, dairyAvailable: 0 })).toThrow();
  });
});

describe('round-off', () => {
  it('rounds payable to whole rupees and records difference', () => {
    const l = [{ name: 'Ring', sku: 'R1', metalValue: 1_000_040, making: 0 }]; // +3% GST = 1,030,041.2 -> 1,030,041
    const r = calculate({ lines: l });
    expect(r.exactPayable).toBe(1_030_041);
    expect(r.finalPayable).toBe(1_030_000);
    expect(r.roundOff).toBe(-41);
    expect(r.finalPayable % 100).toBe(0);
  });
  it('rounds up at 50 paise', () => {
    const l = [{ name: 'X', sku: 'X', metalValue: 10_050, making: 0 }];
    const r = calculate({ lines: l, gstRatePct: 0 });
    expect(r.finalPayable).toBe(10_100); expect(r.roundOff).toBe(50);
  });
});

describe('dairy', () => {
  const s = { start: new Date('2026-01-01'), monthly: 100_000, durationMonths: 11 as const, type: 'BONUS' as const };
  it('counts missed months', () => {
    const r = dairyStatus(s, [{ date: new Date('2026-01-02'), amount: 200_000 }], new Date('2026-05-10'));
    expect(r.missed).toBe(3);
  });
  it('completes with bonus', () => {
    const r = dairyStatus(s, [{ date: new Date('2026-01-02'), amount: 1_100_000 }], new Date('2026-06-01'));
    expect(r.status).toBe('COMPLETED'); expect(r.redeemable).toBe(1_200_000);
  });
});

import { formatINR, amountInWords } from '../src/common/utils/money';
describe('rupee formatting', () => {
  it('uses Indian grouping', () => expect(formatINR(12345600)).toBe('₹ 1,23,456.00'));
  it('writes words', () => expect(amountInWords(12345650)).toBe(
    'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only'));
});

import { financialYearCode, formatDocNumber } from '../src/engines/numbering';
import { priceLine } from '../src/engines/line-pricing';
import { canonicalJson } from '../src/common/utils/canonical-json';

describe('numbering', () => {
  it('uses the Indian financial year (IST)', () => {
    expect(financialYearCode(new Date('2026-03-31T10:00:00Z'))).toBe('2526');
    expect(financialYearCode(new Date('2026-03-31T18:30:00Z'))).toBe('2627'); // 1 Apr 00:00 IST
    expect(financialYearCode(new Date('2026-12-01T00:00:00Z'))).toBe('2627');
  });
  it('formats invoice and credit-note numbers', () => {
    expect(formatDocNumber('RNC1', '2627', 42)).toBe('RNC1-2627-000042');
    expect(formatDocNumber('RNC1', '2627', 7, 'CN')).toBe('RNC1-CN-2627-000007');
  });
});

describe('line pricing', () => {
  const chain = { metal: 'GOLD' as const, netMg: 10_000, makingType: 'PER_GRAM' as const, makingValue: 50_000 };
  it('prices gold: net g × grade rate (no purity %), making per gram', () =>
    expect(priceLine(chain, 1, 700_000)).toEqual({ metalValue: 7_000_000, stoneValue: 0, making: 500_000 }));
  it('multiplies by qty', () => expect(priceLine(chain, 3, 700_000).making).toBe(1_500_000));
  it('percent making is basis points of metal value', () =>
    expect(priceLine({ ...chain, makingType: 'PERCENT', makingValue: 1250 }, 1, 700_000).making).toBe(875_000)); // 12.5% of 70,000
  it('diamond needs no rate; stone value added as-is', () =>
    expect(priceLine({ ...chain, metal: 'DIAMOND', makingType: 'FLAT', makingValue: 100, stoneValuePaise: 5000 }, 2))
      .toEqual({ metalValue: 0, stoneValue: 10_000, making: 200 }));
  it('throws when a rate is missing', () => expect(() => priceLine(chain, 1)).toThrow('GOLD sale rate not set'));
});

describe('canonicalJson', () => {
  it('is independent of key order', () => expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 })));
});

import { priceExchangeItems, summarizeExchange } from '../src/engines/exchange';
describe('old-metal exchange (fine weight)', () => {
  const rates = { GOLD_22K: { ratePerGramPaise: 650_123 }, SILVER: { ratePerGramPaise: 8_000 } };
  const gold = { metal: 'GOLD' as const, grossMg: 10_500, lessMg: 500, purityPct: 91.6 };
  it('fine = net × purity%; value = fine × 22K exchange rate', () => {
    const [i] = priceExchangeItems([gold], rates);
    expect(i).toMatchObject({ netMg: 10_000, fineMg: 9_160, ratePerGramPaise: 650_123, valuePaise: 5_955_127 });
  });
  it('silver uses the silver exchange rate', () =>
    expect(priceExchangeItems([{ metal: 'SILVER', grossMg: 20_000, lessMg: 0, purityPct: 92.5 }], rates)[0])
      .toMatchObject({ fineMg: 18_500, valuePaise: 148_000 }));
  it('sums per metal', () => {
    const items = priceExchangeItems([gold, gold], rates);
    expect(summarizeExchange(items)).toMatchObject({ goldNetMg: 20_000, goldFineMg: 18_320, silverFineMg: 0 });
  });
  it('rejects missing rate and bad weights', () => {
    expect(() => priceExchangeItems([gold], {})).toThrow('GOLD 22K exchange rate not set');
    expect(() => priceExchangeItems([{ ...gold, lessMg: 10_500 }], rates)).toThrow('Less weight');
  });
  it('customer copy: amount only by default, optional fine weight — never gross/less/net/purity/rate', () => {
    const [i] = priceExchangeItems([gold], rates);
    const r = calculate({ lines: [{ name: 'Chain', sku: 'G-1', metalValue: 7_000_000, making: 500_000 }], exchanges: [i] });
    const lines = [{ name: 'Chain', sku: 'G-1', metalValue: 7_000_000, making: 500_000 }];
    const plain = JSON.stringify(toCustomerInvoice(r, lines, { customer: 'X' }));
    const withFine = JSON.stringify(toCustomerInvoice(r, lines, { customer: 'X' }, { exchangeDisplay: 'AMOUNT_AND_FINE_WEIGHT', goldFineMg: 9_160 }));
    expect(plain).toContain('"oldGoldExchange":5955127'); expect(plain).not.toContain('FineWeight');
    expect(withFine).toContain('"oldGoldFineWeightMg":9160');
    for (const s of [plain, withFine]) expect(s).not.toMatch(/grossMg|lessMg|netMg|ratePerGram|purity|exchangeDetail/);
  });
});

import { addMonths, dairyStatusFromPaid } from '../src/engines/dairy.engine';
describe('dairy calendar (IST)', () => {
  const base = { monthly: 100_000, durationMonths: 6 as const, type: 'NORMAL' as const };
  it('month-end never overflows', () =>
    expect(addMonths(new Date('2026-01-31T06:30:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28'));
  it('uses the IST month, not UTC', () => {
    const start = new Date('2026-01-31T19:00:00Z'); // 1 Feb 00:30 IST
    expect(dairyStatusFromPaid({ ...base, start }, 0, new Date('2026-02-15T00:00:00Z'))).toMatchObject({ dueMonths: 1, missed: 1 });
  });
  it('matured with a shortfall once the date passes', () =>
    expect(dairyStatusFromPaid({ ...base, start: new Date('2025-01-01T00:00:00Z') }, 200_000, new Date('2026-01-01T00:00:00Z')).status)
      .toBe('MATURED_SHORTFALL'));
  it('bonus only on a completed bonus scheme', () => {
    const start = new Date('2026-01-01T00:00:00Z'), today = new Date('2026-02-01T00:00:00Z');
    expect(dairyStatusFromPaid({ ...base, start }, 600_000, today).bonus).toBe(0);
    expect(dairyStatusFromPaid({ ...base, start, type: 'BONUS', bonusInstallments: 2 }, 600_000, today).bonus).toBe(200_000);
    expect(dairyStatusFromPaid({ ...base, start, type: 'BONUS' }, 500_000, today).bonus).toBe(0);
  });
});

describe('bill of supply numbering', () => {
  it('uses separate series for GST invoices and bills without GST', () => {
    expect(formatDocNumber('RNC1', '2627', 5, 'INV')).toBe('RNC1-2627-000005');
    expect(formatDocNumber('RNC1', '2627', 5, 'BOS')).toBe('RNC1-BS-2627-000005');
    expect(formatDocNumber('RNC1', '2627', 2, 'BOSCN')).toBe('RNC1-BS-CN-2627-000002');
  });
  it('no GST when the rate is 0', () => {
    const r = calculate({ lines: [{ name: 'Plate', sku: 'S-1', metalValue: 500_000, making: 50_000 }], gstRatePct: 0 });
    expect(r).toMatchObject({ gst: 0, cgst: 0, sgst: 0, grossTotal: 550_000, finalPayable: 550_000, roundOff: 0 });
  });
});
