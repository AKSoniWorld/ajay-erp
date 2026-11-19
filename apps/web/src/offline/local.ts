import type { QuoteProduct, RateMap } from '@ajay/shared';
import type { SchemeLite } from '@/features/pos/AccountPanels';
import type { CartLine, CustomerLite, SearchItem } from '@/features/pos/types';
import { db, getAll, kvGet, putMany } from './db';

/** Reads from the copy of the shop's data kept on this device — used by the till when there is no internet. */
export const localReady = async () => !!(await kvGet('since:products')) && !!(await kvGet('rates'));

export async function loadPricing() {
  const products: Record<string, QuoteProduct> = {};
  for (const p of await getAll('products')) products[p._id] = p;
  return { products, rates: await kvGet<any>('rates') };
}
/** { GOLD_22K: { SALE: {ratePerGramPaise}, … } } → { GOLD_22K: {ratePerGramPaise} } for one kind of rate. */
export const rateMap = (rates: any, kind: 'SALE' | 'EXCHANGE' | 'MARKET'): RateMap => {
  const out: RateMap = {};
  for (const [k, v] of Object.entries<any>(rates ?? {})) if (v?.[kind]) out[k] = { ratePerGramPaise: v[kind].ratePerGramPaise };
  return out;
};

async function stockQty(branchId: string) {
  const m = new Map<string, number>();
  for (const s of await getAll('stock')) if (String(s.branchId) === branchId) m.set(String(s.productId), s.qty);
  return m;
}
const asItem = (p: any, qty: number): SearchItem => ({ _id: p._id, name: p.name, sku: p.sku, metal: p.metal, karat: p.karat, purityPct: p.purityPct, grossMg: p.grossMg, netMg: p.netMg, qty });

export async function localSearch(branchId: string, q: string): Promise<SearchItem[]> {
  const needle = q.trim().toLowerCase(), stock = await stockQty(branchId);
  return (await getAll('products')).filter(p => p.active !== false && (p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle)))
    .slice(0, 20).map(p => asItem(p, stock.get(String(p._id)) ?? 0));
}
export async function localByCode(branchId: string, code: string): Promise<SearchItem[]> {
  const sku = code.trim().replace(/^AJ:/i, '').toUpperCase(), stock = await stockQty(branchId);
  const p = (await getAll('products')).find(x => x.active !== false && String(x.sku).toUpperCase() === sku);
  if (!p) throw new Error('No item for this code');
  return [asItem(p, stock.get(String(p._id)) ?? 0)];
}
export async function localCustomers(q: string): Promise<CustomerLite[]> {
  const n = q.trim().toLowerCase();
  return (await getAll('customers')).filter(c => c.mobile.includes(n) || c.name.toLowerCase().includes(n)).slice(0, 6).map(c => ({ _id: c._id, name: c.name, mobile: c.mobile }));
}
/** Dairy balances the customer can use. A bonus scheme that is not complete loses its bonus if used (same rule as the server). */
export async function localSchemes(customerId: string): Promise<SchemeLite[]> {
  return (await getAll('dairy')).filter(s => String(s.customerId) === customerId && s.balancePaise > 0).map(s => ({
    schemeId: s._id, schemeNo: s.schemeNo, balancePaise: s.balancePaise, status: 'ACTIVE',
    forfeitsBonusIfUsed: s.schemeType === 'BONUS' && !s.bonusCreditedAt && !s.bonusForfeitedAt && s.paidPaise < s.monthlyPaise * s.durationMonths }));
}

/** After a bill is saved offline, take it out of the local stock and dairy balances so the next offline bill cannot reuse them. */
export async function applyLocalSale(branchId: string, lines: CartLine[], dairy: { schemeId: string; amountPaise: number }[]) {
  const stock = (await getAll('stock')).filter(s => String(s.branchId) === branchId);
  const hit = lines.flatMap(l => { const s = stock.find(x => String(x.productId) === l.productId); return s ? [{ ...s, qty: s.qty - l.qty }] : []; });
  await putMany('stock', hit);
  const schemes = await getAll('dairy');
  await putMany('dairy', dairy.flatMap(d => { const s = schemes.find(x => x._id === d.schemeId); return s ? [{ ...s, balancePaise: s.balancePaise - d.amountPaise }] : []; }));
  void db;
}
