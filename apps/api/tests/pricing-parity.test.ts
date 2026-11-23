import { describe, expect, it } from '@jest/globals';
import { buildQuote, calculate, priceExchangeItems, priceLine } from '@ajay/shared';
import { priceExchangeItems as apiExchange } from '../src/engines/exchange';
import { priceLine as apiPriceLine } from '../src/engines/line-pricing';
import { calculate as apiCalculate } from '../src/engines/pricing.engine';

// The offline till prices with @ajay/shared; the server with its own engines. They must never drift apart.
let seed = 20260101;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
const pick = <T,>(xs: T[]) => xs[int(0, xs.length - 1)];

describe('shared pricing = server pricing', () => {
  it('prices lines the same for 500 random products', () => {
    for (let n = 0; n < 500; n++) {
      const p = { metal: pick(['GOLD', 'SILVER', 'DIAMOND'] as const), netMg: int(300, 80_000), makingType: pick(['PER_GRAM', 'FLAT', 'PERCENT'] as const),
        makingValue: int(0, 90_000), stoneValuePaise: int(0, 500_000) };
      const rate = p.metal === 'DIAMOND' ? undefined : int(5_000, 900_000), qty = int(1, 5);
      expect(priceLine(p, qty, rate)).toEqual(apiPriceLine(p, qty, rate));
    }
  });
  it('calculates totals, old metal, dairy and round-off the same for 500 random bills', () => {
    for (let n = 0; n < 500; n++) {
      const lines = Array.from({ length: int(1, 4) }, (_, i) => ({ name: `Item${i}`, sku: `S-${i}`, metalValue: int(100_000, 9_000_000), making: int(0, 900_000) }));
      const exchanges = rnd() < 0.5 ? [] : [{ metal: pick(['GOLD', 'SILVER'] as const), grossMg: int(2_000, 20_000), lessMg: int(0, 1_000), purityPct: pick([91.6, 75, 92.5, 99.9, 58.33]),
        ratePerGramPaise: int(5_000, 800_000) }];
      const dairyAvailable = int(0, 2_000_000), dairyAdjustment = rnd() < 0.5 ? 0 : int(0, dairyAvailable), gstRatePct = pick([undefined, 0, 3]);
      const input = { lines, exchanges, dairyAdjustment, dairyAvailable, gstRatePct };
      let a: any, b: any, ea: any, eb: any;
      try { a = calculate(input); } catch (e: any) { ea = e.message; }
      try { const { exchangeDetail, ...rest } = apiCalculate(input); void exchangeDetail; b = rest; } catch (e: any) { eb = e.message; }
      expect(ea).toEqual(eb); expect(a).toEqual(b);
    }
  });
  it('prices old metal the same', () => {
    const rates = { GOLD_22K: { ratePerGramPaise: 650_123 }, SILVER: { ratePerGramPaise: 8_000 } };
    for (let n = 0; n < 200; n++) {
      const i = [{ metal: pick(['GOLD', 'SILVER'] as const), grossMg: int(1_000, 30_000), lessMg: int(0, 900), purityPct: pick([91.6, 75, 92.5]) }];
      expect(priceExchangeItems(i, rates)).toEqual(apiExchange(i, rates));
    }
  });
  it('buildQuote gives the known figures (₹77,250; with ₹59,551 old gold ₹17,699; no GST ₹75,000)', () => {
    const chain = { _id: 'c1', name: 'Chain', sku: 'G-1', metal: 'GOLD' as const, karat: 22, purityPct: 91.6, grossMg: 10_500, netMg: 10_000, makingType: 'PER_GRAM' as const, makingValue: 50_000 };
    const base = { products: { c1: chain }, saleRates: { GOLD_22K: { ratePerGramPaise: 700_000 } }, exchangeRates: { GOLD_22K: { ratePerGramPaise: 650_123 } }, lines: [{ productId: 'c1' }] };
    expect(buildQuote(base).totals.finalPayable).toBe(7_725_000);
    const ex = buildQuote({ ...base, exchanges: [{ metal: 'GOLD', grossMg: 10_500, lessMg: 500, purityPct: 91.6 }] });
    expect(ex.totals).toMatchObject({ goldExchange: 5_955_127, finalPayable: 1_769_900, roundOff: 27 });
    expect(ex.exchanges[0]).toMatchObject({ netMg: 10_000, fineMg: 9_160 });
    expect(buildQuote({ ...base, taxMode: 'NON_GST' }).totals).toMatchObject({ gst: 0, finalPayable: 7_500_000 });
    expect(() => buildQuote({ ...base, saleRates: {} })).toThrow('GOLD 22K sale rate not set');
  });

  it('applies GST-inclusive discounts to making first, then product value', () => {
    const parity = (input: any) => {
      const shared = calculate(input);
      const { exchangeDetail, ...server } = apiCalculate(input);
      void exchangeDetail;
      expect(server).toEqual(shared);
      return shared;
    };

    const lines = [
      { name: 'Gold Jewellery', sku: 'G-1', metalValue: 1_000_000, making: 200_000 },
    ];

    // Original gross: ₹12,360. Gross discount: ₹360. Final gross: ₹12,000.
    const makingFirst = parity({ lines, gstRatePct: 3, discountPaise: 36_000 });
    expect(makingFirst).toMatchObject({
      taxableBeforeDiscount: 1_200_000,
      discountAppliedPaise: 36_000,
      jewelleryAfterDiscount: 1_000_000,
      productDiscountPaise: 0,
      grossTotal: 1_200_000,
    });
    expect(makingFirst.makingAfterDiscount).toBeLessThan(200_000);
    expect(makingFirst.makingAfterDiscount).toBeGreaterThan(0);

    // Discount exceeds the gross making-charge capacity; product value absorbs the remainder.
    const productFallback = parity({ lines, gstRatePct: 3, discountPaise: 250_000 });
    expect(productFallback.makingAfterDiscount).toBe(0);
    expect(productFallback.productDiscountPaise).toBeGreaterThan(0);
    expect(productFallback.discountAppliedPaise).toBeCloseTo(250_000, 0);

    // Without GST, the discount is deducted directly from making charges.
    const withoutGst = parity({ lines, gstRatePct: 0, discountPaise: 36_000 });
    expect(withoutGst).toMatchObject({
      gst: 0,
      jewelleryAfterDiscount: 1_000_000,
      makingAfterDiscount: 164_000,
      discountAppliedPaise: 36_000,
      grossTotal: 1_164_000,
    });

    // A discount greater than the original GST-inclusive bill must be rejected.
    const excessive = { lines, gstRatePct: 3, discountPaise: 1_236_001 };
    expect(() => calculate(excessive)).toThrow('Discount cannot exceed the gross bill amount');
    expect(() => apiCalculate(excessive)).toThrow('Discount cannot exceed the gross bill amount');
  });
});
