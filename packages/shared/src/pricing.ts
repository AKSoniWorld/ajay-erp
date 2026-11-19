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
/** metal value = net weight (g) × sale rate of the item's grade (no purity %); making: per gram on net weight / flat / % (basis points) of metal value. */
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

export interface ExchangeInput { metal: 'GOLD' | 'SILVER'; grossMg: number; lessMg: number; purityPct: number; remarks?: string }
export interface ExchangeItem extends ExchangeInput { ratePerGramPaise: Paise }
export interface PricedExchange extends ExchangeItem { netMg: number; fineMg: number; valuePaise: Paise }

export const netMgOf = (e: ExchangeItem) => {
  if (e.lessMg < 0 || e.lessMg > e.grossMg) throw new Error('Invalid less weight');
  return e.grossMg - e.lessMg;
};
/** Fine weight (mg) = net weight × purity %. */
export const fineMgOf = (e: ExchangeItem) => Math.round((netMgOf(e) * e.purityPct) / 100);
/** Old-metal value = fine weight × exchange rate. */
export const exchangeValueOf = (e: ExchangeItem): Paise => Math.round((fineMgOf(e) * e.ratePerGramPaise) / 1000);

/** Gold is valued at the 22K EXCHANGE rate, silver at the silver EXCHANGE rate. */
export const exchangeRateKey = (m: 'GOLD' | 'SILVER') => (m === 'GOLD' ? 'GOLD_22K' : 'SILVER');
export type RateMap = Record<string, { ratePerGramPaise: number }>;

export function priceExchangeItems(inputs: ExchangeInput[], rates: RateMap): PricedExchange[] {
  return inputs.map(i => {
    const key = exchangeRateKey(i.metal), rate = rates[key]?.ratePerGramPaise;
    if (!rate) throw new Error(`${key.replace('_', ' ')} exchange rate not set`);
    if (i.lessMg < 0 || i.lessMg >= i.grossMg) throw new Error('Less weight must be smaller than gross weight');
    const item: ExchangeItem = { metal: i.metal, grossMg: i.grossMg, lessMg: i.lessMg, purityPct: i.purityPct, ratePerGramPaise: rate, remarks: i.remarks };
    return { ...item, netMg: netMgOf(item), fineMg: fineMgOf(item), valuePaise: exchangeValueOf(item) };
  });
}

export interface PricingInput {
  lines: { name: string; sku: string; metalValue: Paise; making: Paise }[];
  gstRatePct?: number; exchanges?: ExchangeItem[]; dairyAdjustment?: Paise; dairyAvailable?: Paise;
}
/** Order: jewellery + making + GST − old gold − old silver = subtotal; − dairy = payable; rounded to whole rupees (difference = roundOff). */
export function calculate(input: PricingInput) {
  const gstRate = input.gstRatePct ?? 3;
  const jewellery = input.lines.reduce((s, l) => s + l.metalValue, 0);
  const making = input.lines.reduce((s, l) => s + l.making, 0);
  const taxable = jewellery + making;
  const gst = Math.round((taxable * gstRate) / 100);
  const cgst = Math.floor(gst / 2), sgst = gst - cgst;
  const grossTotal = taxable + gst;
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
  return { jewellery, making, taxable, gstRate, cgst, sgst, gst, grossTotal, goldExchange, silverExchange, subtotal, dairy,
    exactPayable, roundOff: finalPayable - exactPayable, finalPayable };
}

export interface QuoteProduct {
  _id: string; name: string; sku: string; hsn?: string; metal: 'GOLD' | 'SILVER' | 'DIAMOND'; karat?: number; purityPct: number;
  grossMg: number; netMg: number; makingType: 'PER_GRAM' | 'FLAT' | 'PERCENT'; makingValue: number; stoneValuePaise?: number; active?: boolean;
}
/** The same quote the server's POS builds (lines, totals, priced old metal) — used while offline. Throws the server's messages. */
export function buildQuote(a: {
  products: Record<string, QuoteProduct>; saleRates: RateMap; exchangeRates: RateMap;
  lines: { productId: string; qty?: number }[]; exchanges?: ExchangeInput[];
  dairyAdjustment?: Paise; dairyAvailable?: Paise; taxMode?: 'GST' | 'NON_GST';
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
    exchanges, dairyAdjustment: a.dairyAdjustment, dairyAvailable: a.dairyAvailable, gstRatePct: a.taxMode === 'NON_GST' ? 0 : undefined,
  });
  if (totals.finalPayable < 0) throw new Error('Old-metal value exceeds the bill amount. Add items or reduce the exchange.');
  return { lines, totals, exchanges };
}
