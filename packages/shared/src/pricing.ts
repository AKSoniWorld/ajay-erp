/**
 * Pricing rules shared by the server and the offline till. Money is paise, weight is mg.
 * apps/api/tests/pricing-parity.test.ts checks this against the server's own engines, so a bill priced on a device
 * without internet comes out exactly as the server will price it.
 */
export type Paise = number;
export const roundToRupee = (paise: Paise): Paise => Math.round(paise / 100) * 100;

export interface PricedProduct {
  metal: 'GOLD' | 'SILVER' | 'DIAMOND'; netMg: number;
  makingType: 'PER_GRAM' | 'FLAT' | 'PERCENT'; makingValue: number; stoneValuePaise?: number;
}
/** metal value = net weight (g) Ãƒâ€” sale rate of the item's grade (no purity %); making: per gram on net weight / flat / % (basis points) of metal value. */
export function priceLine(p: PricedProduct, qty: number, ratePerGramPaise?: number, rateLabel: string = p.metal) {
  if (!Number.isInteger(qty) || qty < 1) throw new Error('qty must be a positive integer');
  let metalUnit = 0;
  if (p.metal !== 'DIAMOND') {
    if (!ratePerGramPaise) throw new Error(`${rateLabel} sale rate not set`);
    metalUnit = Math.round((p.netMg * ratePerGramPaise) / 1000);
  }
  const makingUnit = p.makingType === 'PER_GRAM' ? Math.round((p.netMg / 1000) * p.makingValue)
    : p.makingType === 'FLAT' ? p.makingValue : Math.round((metalUnit * p.makingValue) / 10_000);
  return { metalValue: metalUnit * qty, stoneValue: (p.stoneValuePaise ?? 0) * qty, making: makingUnit * qty };
}

export interface ExchangeInput { metal: 'GOLD' | 'SILVER'; grossMg: number; lessMg: number; purityPct: number; remarks?: string | null }
export interface ExchangeItem extends ExchangeInput { ratePerGramPaise: Paise }
export interface PricedExchange extends ExchangeItem { netMg: number; fineMg: number; valuePaise: Paise }

export const netMgOf = (e: ExchangeItem) => {
  if (e.lessMg < 0 || e.lessMg > e.grossMg) throw new Error('Invalid less weight');
  return e.grossMg - e.lessMg;
};
/** Fine weight (mg) = net weight Ãƒâ€” purity %. */
export const fineMgOf = (e: ExchangeItem) => Math.round((netMgOf(e) * e.purityPct) / 100);
/** Old-metal value = fine weight Ãƒâ€” exchange rate. */
export const exchangeValueOf = (e: ExchangeItem): Paise => Math.round((fineMgOf(e) * e.ratePerGramPaise) / 1000);

/** Gold is valued at the 22K EXCHANGE rate, silver at the silver EXCHANGE rate. */
export const exchangeRateKey = (m: 'GOLD' | 'SILVER') => (m === 'GOLD' ? 'GOLD_22K' : 'SILVER');
export type RateMap = Record<string, { ratePerGramPaise: number }>;

export function priceExchangeItems(inputs: ExchangeInput[], rates: RateMap): PricedExchange[] {
  return inputs.map(i => {
    const key = exchangeRateKey(i.metal), rate = rates[key]?.ratePerGramPaise;
    if (!rate) throw new Error(`${key.replace('_', ' ')} exchange rate not set`);
    if (i.lessMg < 0 || i.lessMg >= i.grossMg) throw new Error('Less weight must be smaller than gross weight');
    //const item: ExchangeItem = { metal: i.metal, grossMg: i.grossMg, lessMg: i.lessMg, purityPct: i.purityPct, ratePerGramPaise: rate, remarks: i.remarks };
    const item: ExchangeItem = {
      metal: i.metal,
      grossMg: i.grossMg,
      lessMg: i.lessMg,
      purityPct: i.purityPct,
      ratePerGramPaise: rate,
      remarks: i.remarks ?? null,
    };
    return { ...item, netMg: netMgOf(item), fineMg: fineMgOf(item), valuePaise: exchangeValueOf(item) };
  });
}

export interface PricingInput {
  lines: { name: string; sku: string; metalValue: Paise; making: Paise }[];
  gstRatePct?: number; exchanges?: ExchangeItem[]; dairyAdjustment?: Paise; dairyAvailable?: Paise;
  discountPaise?: Paise;
}
/** Order: jewellery + making + GST Ã¢Ë†â€™ old gold Ã¢Ë†â€™ old silver = subtotal; Ã¢Ë†â€™ dairy = payable; rounded to whole rupees (difference = roundOff). */
export function calculate(input: PricingInput) {
  const gstRate = input.gstRatePct ?? 3;
  const jewellery = input.lines.reduce((s, l) => s + l.metalValue, 0);
  const making = input.lines.reduce((s, l) => s + l.making, 0);
  const taxableBeforeDiscount = jewellery + making;
  const discountPaise = input.discountPaise ?? 0;

  if (!Number.isSafeInteger(discountPaise) || discountPaise < 0)
    throw new Error('Discount must be a non-negative whole amount in paise');

  const gstFor = (base: number) => Math.round((base * gstRate) / 100);
  const grossFor = (base: number) => base + gstFor(base);
  const originalGrossTotal = grossFor(taxableBeforeDiscount);

  if (discountPaise > originalGrossTotal)
    throw new Error('Discount cannot exceed the gross bill amount');

  const closestBaseForGross = (min: number, max: number, target: number) => {
    let lo = min, hi = max, best = min;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const amount = grossFor(mid);
      const bestAmount = grossFor(best);
      if (Math.abs(amount - target) < Math.abs(bestAmount - target) ||
        (Math.abs(amount - target) === Math.abs(bestAmount - target) && amount > bestAmount)) {
        best = mid;
      }
      if (amount < target) lo = mid + 1;
      else if (amount > target) hi = mid - 1;
      else return mid;
    }
    for (const candidate of [lo, hi]) {
      if (candidate < min || candidate > max) continue;
      const amount = grossFor(candidate);
      const bestAmount = grossFor(best);
      if (Math.abs(amount - target) < Math.abs(bestAmount - target) ||
        (Math.abs(amount - target) === Math.abs(bestAmount - target) && amount > bestAmount)) {
        best = candidate;
      }
    }
    return best;
  };

  let jewelleryAfterDiscount = jewellery;
  let makingAfterDiscount = making;
  const grossAfterRemovingAllMaking = grossFor(jewellery);
  const makingDiscountCapacity = originalGrossTotal - grossAfterRemovingAllMaking;

  if (discountPaise <= makingDiscountCapacity) {
    makingAfterDiscount = closestBaseForGross(0, making, grossFor(making) - discountPaise);
  } else {
    makingAfterDiscount = 0;
    const remainingProductDiscount = discountPaise - makingDiscountCapacity;
    jewelleryAfterDiscount = closestBaseForGross(0, jewellery, grossFor(jewellery) - remainingProductDiscount);
  }

  const makingDiscountPaise = making - makingAfterDiscount;
  const productDiscountPaise = jewellery - jewelleryAfterDiscount;
  const discountTaxablePaise = makingDiscountPaise + productDiscountPaise;
  const taxable = jewelleryAfterDiscount + makingAfterDiscount;
  const gst = gstFor(taxable);
  const cgst = Math.floor(gst / 2), sgst = gst - cgst;
  const grossTotal = taxable + gst;
  const discountAppliedPaise = originalGrossTotal - grossTotal;

  const ex = input.exchanges ?? [];
  const goldExchange = ex.filter(e => e.metal === 'GOLD').reduce((s, e) => s + exchangeValueOf(e), 0);
  const silverExchange = ex.filter(e => e.metal === 'SILVER').reduce((s, e) => s + exchangeValueOf(e), 0);
  const subtotal = grossTotal - goldExchange - silverExchange;

  const dairy = input.dairyAdjustment ?? 0;
  if (dairy < 0) throw new Error('Dairy adjustment cannot be negative');
  if (dairy > (input.dairyAvailable ?? 0)) throw new Error('Dairy adjustment exceeds ledger balance');
  if (dairy > Math.max(subtotal, 0)) throw new Error('Dairy adjustment exceeds payable');

  const exactPayable = subtotal - dairy;
  const finalPayable = roundToRupee(exactPayable);

  return {
    jewellery, making, taxableBeforeDiscount, discountPaise, discountAppliedPaise,
    makingAfterDiscount, jewelleryAfterDiscount, makingDiscountPaise, productDiscountPaise,
    discountTaxablePaise, taxable, gstRate, cgst, sgst, gst, grossTotal,
    goldExchange, silverExchange, subtotal, dairy, exactPayable,
    roundOff: finalPayable - exactPayable, finalPayable,
  };
}

export interface QuoteProduct {
  _id: string; name: string; sku: string; hsn?: string; metal: 'GOLD' | 'SILVER' | 'DIAMOND'; karat?: number; purityPct: number;
  grossMg: number; netMg: number; makingType: 'PER_GRAM' | 'FLAT' | 'PERCENT'; makingValue: number; stoneValuePaise?: number; active?: boolean;
}
/** The same quote the server's POS builds (lines, totals, priced old metal) Ã¢â‚¬â€ used while offline. Throws the server's messages. */
export function buildQuote(a: {
  products: Record<string, QuoteProduct>; saleRates: RateMap; exchangeRates: RateMap;
  lines: { productId: string; qty?: number }[]; exchanges?: ExchangeInput[];
  dairyAdjustment?: Paise; dairyAvailable?: Paise; discountPaise?: Paise; taxMode?: 'GST' | 'NON_GST';
}) {
  const ids = a.lines.map(l => l.productId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate product lines; increase qty instead');
  const lines = a.lines.map(it => {
    const p = a.products[it.productId];
    if (!p || p.active === false) throw new Error(`Product ${it.productId} is unavailable`);
    const key = p.metal === 'GOLD' ? (p.karat ? `GOLD_${p.karat}K` : undefined) : p.metal === 'SILVER' ? 'SILVER' : undefined;
    if (p.metal === 'GOLD' && !key) throw new Error(`${p.sku} has no karat set`);
    const qty = it.qty ?? 1;
    const priced = priceLine(p, qty, key ? a.saleRates[key]?.ratePerGramPaise : undefined, key?.replace('_', ' '));
    return { productId: p._id, name: p.name, sku: p.sku, hsn: p.hsn, metal: p.metal, karat: p.karat, purityPct: p.purityPct,
      grossMg: p.grossMg, netMg: p.netMg, qty, ...priced };
  });
  const exchanges = priceExchangeItems(a.exchanges ?? [], a.exchangeRates);
  const totals = calculate({
    lines: lines.map(l => ({ name: l.name, sku: l.sku, metalValue: l.metalValue + l.stoneValue, making: l.making })),
    exchanges, dairyAdjustment: a.dairyAdjustment, dairyAvailable: a.dairyAvailable, discountPaise: a.discountPaise,
    gstRatePct: a.taxMode === 'NON_GST' ? 0 : undefined,
  });
  if (totals.finalPayable < 0) throw new Error('Old-metal value exceeds the bill amount. Add items or reduce the exchange.');
  return { lines, totals, exchanges };
}
