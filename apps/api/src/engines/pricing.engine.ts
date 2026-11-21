// All money in paise (integers), weights in milligrams. No floats in storage.
export type Paise = number;

export interface InvoiceLine {
  name: string; sku: string; metalValue: Paise; making: Paise;
  hsn?: string; qty?: number; karat?: number; purityPct?: number; grossMg?: number; netMg?: number; // jewellery details (customer-visible)
}
export interface ExchangeItem {
  metal: 'GOLD' | 'SILVER';
  grossMg: number; lessMg: number;
  purityPct: number;            // tested purity of the old metal, e.g. 91.6
  ratePerGramPaise: Paise;      // admin-controlled EXCHANGE rate (gold: 22K rate; silver: silver rate)
  remarks?: string | null;
}
export interface PricingInput {
  lines: InvoiceLine[];
  gstRatePct?: number;          // default 3 (jewellery)
  exchanges?: ExchangeItem[];
  dairyAdjustment?: Paise;      // requested
  dairyAvailable?: Paise;       // ledger balance usable
  discountPaise?: Paise;        // fixed discount, deducted before GST
}

export const roundToRupee = (paise: Paise): Paise => Math.round(paise / 100) * 100;

export const netMg = (e: ExchangeItem) => {
  if (e.lessMg < 0 || e.lessMg > e.grossMg) throw new Error('Invalid less weight');
  return e.grossMg - e.lessMg;
};
/** Fine weight (mg) = net weight Ã— purity %. */
export const fineMg = (e: ExchangeItem) => Math.round((netMg(e) * e.purityPct) / 100);
/** Old-metal value = fine weight Ã— exchange rate. */
export const exchangeValue = (e: ExchangeItem): Paise => Math.round((fineMg(e) * e.ratePerGramPaise) / 1000);

export function calculate(input: PricingInput) {
  const gstRate = input.gstRatePct ?? 3;
  const jewellery = input.lines.reduce((s, l) => s + l.metalValue, 0);
  const making = input.lines.reduce((s, l) => s + l.making, 0);
  const taxableBeforeDiscount = jewellery + making;
  const discountPaise = input.discountPaise ?? 0;
  if (!Number.isSafeInteger(discountPaise) || discountPaise < 0)
    throw new Error('Discount must be a non-negative whole amount in paise');
  if (discountPaise > taxableBeforeDiscount)
    throw new Error('Discount cannot exceed the taxable bill amount');
  const taxable = taxableBeforeDiscount - discountPaise;
  const gst = Math.round((taxable * gstRate) / 100);
  const cgst = Math.floor(gst / 2), sgst = gst - cgst; // intra-state (Jharkhand)
  const grossTotal = taxable + gst;

  const ex = input.exchanges ?? [];
  const goldExchange = ex.filter(e => e.metal === 'GOLD').reduce((s, e) => s + exchangeValue(e), 0);
  const silverExchange = ex.filter(e => e.metal === 'SILVER').reduce((s, e) => s + exchangeValue(e), 0);
  const subtotal = grossTotal - goldExchange - silverExchange;

  const dairy = input.dairyAdjustment ?? 0;
  if (dairy < 0) throw new Error('Dairy adjustment cannot be negative');
  if (dairy > (input.dairyAvailable ?? 0)) throw new Error('Dairy adjustment exceeds ledger balance');
  if (dairy > Math.max(subtotal, 0)) throw new Error('Dairy adjustment exceeds payable');
  const exactPayable = subtotal - dairy;
  // Round-off: final payable is always whole rupees (>= 50 paise rounds up). Difference shown as a line.
  const finalPayable = roundToRupee(exactPayable);
  const roundOff = finalPayable - exactPayable; // paise, can be negative

  return {
    jewellery, making, taxableBeforeDiscount, discountPaise, taxable, gstRate, cgst, sgst, gst, grossTotal,
    goldExchange, silverExchange, subtotal, dairy, exactPayable, roundOff, finalPayable,
    exchangeDetail: ex.map(e => ({ ...e, netMg: netMg(e), fineMg: fineMg(e), value: exchangeValue(e) })), // INTERNAL ONLY
  };
}

/** Backend-enforced whitelist: nothing about weight, rate or dairy breakdown can leak. */
export function toCustomerInvoice(r: ReturnType<typeof calculate>, lines: InvoiceLine[],
  meta: { customer: string; remarks?: string },
  opts: { exchangeDisplay?: 'AMOUNT' | 'AMOUNT_AND_FINE_WEIGHT'; goldFineMg?: number; silverFineMg?: number;
    settlement?: { advance: number; received: number; due: number } } = {}) {
  return {
    customer: meta.customer, remarks: meta.remarks ?? '',
    items: lines.map(l => ({
      name: l.name, sku: l.sku,
      ...(l.hsn && { hsn: l.hsn }), ...(l.qty !== undefined && { qty: l.qty }),
      ...(l.karat !== undefined && { karat: l.karat }),
      ...(l.purityPct !== undefined && { purityPct: l.purityPct }),
      ...(l.grossMg !== undefined && { grossWeightMg: l.grossMg }),
      ...(l.netMg !== undefined && { netWeightMg: l.netMg }),
      amount: l.metalValue + l.making,
    })),
    taxableBeforeDiscount: r.taxableBeforeDiscount,
    discountPaise: r.discountPaise,
    taxable: r.taxable,
    gst: { cgst: r.cgst, sgst: r.sgst, total: r.gst, ratePct: r.gstRate },
    oldGoldExchange: r.goldExchange,     // amount only
    oldSilverExchange: r.silverExchange, // amount only
    // Optional per-branch: total FINE weight ("jama") only â€” never gross/less/net weight, purity or rate.
    ...(opts.exchangeDisplay === 'AMOUNT_AND_FINE_WEIGHT' &&
      { oldGoldFineWeightMg: opts.goldFineMg ?? 0, oldSilverFineWeightMg: opts.silverFineMg ?? 0 }),
    dairyAdjustment: r.dairy,            // amount only
    roundOff: r.roundOff,                // signed paise, e.g. -40 or +60
    ...(opts.settlement && { advanceAdjusted: opts.settlement.advance, amountReceived: opts.settlement.received, balanceDue: opts.settlement.due }),
    netPayable: r.finalPayable,          // whole rupees
  };
}
