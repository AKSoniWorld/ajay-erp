import { formatINR } from '@/lib/format';

/** Right-aligned, tabular rupees. Negative amounts (returns, refunds) read in red. */
export function Money({ paise, strong, decimals }: { paise: number | null | undefined; strong?: boolean; decimals?: boolean }) {
  const neg = paise !== null && paise !== undefined && paise < 0;
  return <span className={`num ${strong ? 'font-semibold' : ''} ${neg ? 'text-danger' : ''}`}>{formatINR(paise, { decimals })}</span>;
}
