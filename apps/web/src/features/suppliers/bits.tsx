import { formatINR, grams } from '@/lib/format';

/** A balance in words: positive = we owe the supplier, negative = the supplier owes us (we paid ahead). */
export function Owed({ value, kind }: { value: number; kind: 'cash' | 'metal' }) {
  const text = kind === 'cash' ? formatINR(Math.abs(value)) : grams(Math.abs(value));
  if (value === 0) return <span className="text-muted">Settled</span>;
  return value > 0 ? <span className="text-warn">Hume dena hai (Baaki)  {text}</span> : <span className="text-ok">Hume lena hai (JAMA) {text}</span>;
}
export const KIND: Record<string, string> = { PURCHASE: 'Purchase', PAYMENT: 'Payment', PURCHASE_CANCEL: 'Purchase cancelled', CONVERSION: 'Rate cut', MANUAL: 'Correction' };
export const mgOf = (g: string) => Math.round(Number(g) * 1000);
