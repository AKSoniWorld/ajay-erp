export interface PricedProduct {
  metal: 'GOLD' | 'SILVER' | 'DIAMOND'; netMg: number;
  makingType: 'PER_GRAM' | 'FLAT' | 'PERCENT'; makingValue: number; stoneValuePaise?: number;
}
/**
 * Prices one invoice line (paise, already × qty).
 * metal value = net weight (g) × sale rate of the item's grade (GOLD 22K / GOLD 18K / SILVER).
 * Purity is NOT applied — the grade rate already reflects it.
 * Making: PER_GRAM on net weight · FLAT per piece · PERCENT (basis points) of metal value. Stone value added as-is.
 */
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
