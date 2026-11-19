import { Link } from 'react-router-dom';
import { formatINR, timeIST } from '@/lib/format';
import { GRADES, useRates } from './useRates';

/** The numbers every jeweller watches, always in view. */
export function RateStrip() {
  const { data, isError } = useRates();
  const sale = GRADES.map(g => ({ g, c: data?.[g.key]?.SALE }));
  const latest = sale.map(s => s.c?.at).filter(Boolean).sort().pop();
  return (
    <Link to="/rates" className="flex min-w-0 items-baseline gap-5 overflow-x-auto whitespace-nowrap rounded px-2 py-1 hover:bg-gold-wash" title="Open rates">
      {sale.map(({ g, c }) => (
        <span key={g.key} className="flex items-baseline gap-1.5 text-sm">
          <span className="text-muted">{g.label.replace('Gold ', '').replace('Silver', 'Silver')}{g.metal === 'GOLD' ? '' : ''}</span>
          <span className={`num font-semibold ${c ? 'text-gold-deep' : 'text-muted'}`}>{c ? formatINR(c.ratePerGramPaise, { decimals: false }) : 'not set'}</span>
        </span>
      ))}
      <span className="text-xs text-muted">{isError ? 'rates unavailable' : latest ? `/g · updated ${timeIST(latest)}` : '/g'}</span>
    </Link>
  );
}
