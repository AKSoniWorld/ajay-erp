import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { kvGet } from '@/offline/db';
import { api } from './api';
import { useAuth } from './auth';

export const useOnline = () => {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(true), d = () => setOn(false);
    window.addEventListener('online', u); window.addEventListener('offline', d);
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', d); };
  }, []);
  return on;
};

export interface Branch { _id: string; name: string; code: string; gstRegistered: boolean; state?: string; address?: string; exchangeDisplay?: 'AMOUNT' | 'AMOUNT_AND_FINE_WEIGHT'; invoicePaper?: 'A4' | 'A5'; receiptPaper?: 'A4' | 'A5'; printer?: { tagSize: '40x25' | '50x25'; connection: string; language?: 'ESCPOS' | 'TSPL' } }
export const useBranches = () => useQuery({ queryKey: ['branches'], queryFn: async () => { try { return await api<Branch[]>('/branches'); } catch (e) { const c = await kvGet<Branch[]>('branches'); if (c) return c; throw e; } }, staleTime: 5 * 60_000 });
export const useActiveBranch = () => {
  const id = useAuth(s => s.activeBranchId);
  const { data } = useBranches();
  return data?.find(b => b._id === id) ?? data?.[0];
};

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
