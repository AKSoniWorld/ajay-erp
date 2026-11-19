export interface SearchItem {
  _id: string; name: string; sku: string; metal: 'GOLD' | 'SILVER' | 'DIAMOND'; karat?: number; purityPct: number;
  grossMg: number; netMg: number; qty: number;       // qty = stock at the selected branch
}
export interface CartLine { productId: string; name: string; sku: string; karat?: number; metal: string; netMg: number; qty: number; stock: number }
export interface CustomerLite { _id: string; name: string; mobile: string; isNew?: boolean }   // isNew = made while offline, created on the server when the bill syncs
export interface PayRow { mode: 'CASH' | 'UPI' | 'CARD'; text: string }
export const gradeLabel = (i: { metal: string; karat?: number; purityPct?: number }) =>
  i.metal === 'GOLD' ? `${i.karat}K` : i.metal === 'SILVER' ? `Silver ${i.purityPct}%` : 'Diamond';

// ---- old metal / dairy / advance on the bill ----
export interface ExRow { metal: 'GOLD' | 'SILVER'; gross: string; less: string; purity: string }   // weights typed in grams
export interface DairyRow { schemeId: string; text: string; confirm: boolean }
export const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
export const gToMg = (s: string) => Math.round(num(s) * 1000);
export const DEFAULT_PURITY = { GOLD: '91.6', SILVER: '92.5' } as const;

/** A row the server can price: gross > 0, purity 1–100, less < gross. The rate is never typed here — the server applies the admin's exchange rate. */
export function toExchange(r: ExRow) {
  const gross = gToMg(r.gross), less = gToMg(r.less), purity = num(r.purity);
  if (!(gross > 0) || !(purity >= 1 && purity <= 100) || less < 0 || less >= gross) return null;
  return { metal: r.metal, grossMg: gross, lessMg: less, purityPct: Math.round(purity * 100) / 100 };
}
