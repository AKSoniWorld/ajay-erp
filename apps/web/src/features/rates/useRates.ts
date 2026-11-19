import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { kvGet } from '@/offline/db';

export type RateKind = 'SALE' | 'EXCHANGE' | 'MARKET';
export interface RateCell { id: string; ratePerGramPaise: number; at: string }
export type RatesNow = Record<string, Partial<Record<RateKind, RateCell | null>>>;

export interface Grade { key: string; label: string; metal: 'GOLD' | 'SILVER'; karat?: 24 | 22 | 18; kinds: RateKind[] }
/** Which rates each grade actually uses (SALE for bills, EXCHANGE for old metal, MARKET for supplier settlements). */
export const GRADES: Grade[] = [
  { key: 'GOLD_24K', label: 'Gold 24K', metal: 'GOLD', karat: 24, kinds: ['SALE', 'MARKET'] },
  { key: 'GOLD_22K', label: 'Gold 22K', metal: 'GOLD', karat: 22, kinds: ['SALE', 'EXCHANGE'] },
  { key: 'GOLD_18K', label: 'Gold 18K', metal: 'GOLD', karat: 18, kinds: ['SALE'] },
  { key: 'SILVER', label: 'Silver', metal: 'SILVER', kinds: ['SALE', 'EXCHANGE', 'MARKET'] },
];
export const KIND_LABEL: Record<RateKind, string> = { SALE: 'Selling rate', EXCHANGE: 'Old metal buying rate', MARKET: 'Supplier settlement rate' };

export const useRates = () => useQuery({ queryKey: ['rates'], queryFn: async () => { try { return await api<RatesNow>('/rates/current'); } catch (e) { const c = await kvGet<RatesNow>('rates'); if (c) return c; throw e; } }, staleTime: 60_000, refetchInterval: 5 * 60_000 });
