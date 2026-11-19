import { dateTimeIST, formatINR, grams } from '@/lib/format';
import { Money } from '@/components/ui/Money';

export type ColType = 'text' | 'money' | 'weight' | 'int' | 'date' | 'pct';
export interface Report {
  title: string; period?: { from: string; to: string };
  columns: { key: string; label: string; type: ColType }[]; rows: Record<string, any>[]; totals?: Record<string, any>; meta?: Record<string, any>;
}
const RIGHT: ColType[] = ['money', 'weight', 'int', 'pct'];
const SHOW = 500;

const Cell = ({ v, type }: { v: any; type: ColType }) => {
  if (v === null || v === undefined || v === '') return <span className="text-muted">{type === 'text' ? '' : '—'}</span>;
  if (type === 'money') return <Money paise={v} />;
  if (type === 'weight') return <span className="num">{grams(v)}</span>;
  if (type === 'pct') return <span className="num">{v}%</span>;
  if (type === 'date') return <span className="whitespace-nowrap text-muted">{dateTimeIST(v)}</span>;
  return <>{String(v)}</>;
};

/** Any server report: columns, rows (first 500 shown — export for everything), a totals row and the report's extra facts. */
export function ReportTable({ r }: { r: Report }) {
  const rows = r.rows.slice(0, SHOW);
  return (
    <div>
      <MetaView meta={r.meta} />
      <div className="overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted">{r.columns.map(c => <th key={c.key} className={`p-3 font-medium ${RIGHT.includes(c.type) ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, n) => <tr key={n} className="border-b border-line last:border-0">{r.columns.map(c => <td key={c.key} className={`p-3 ${RIGHT.includes(c.type) ? 'text-right' : ''}`}><Cell v={row[c.key]} type={c.type} /></td>)}</tr>)}
            {rows.length === 0 && <tr><td colSpan={r.columns.length} className="p-6 text-center text-muted">Nothing in this period.</td></tr>}
            {r.totals && rows.length > 0 && (
              <tr className="border-t-2 border-line font-semibold">{r.columns.map((c, i) => <td key={c.key} className={`p-3 ${RIGHT.includes(c.type) ? 'text-right' : ''}`}>{i === 0 ? 'Total' : <Cell v={r.totals![c.key]} type={c.type} />}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {r.rows.length > SHOW && <p className="mt-2 text-sm text-muted">Showing the first {SHOW} of {r.rows.length} rows. Download the CSV or PDF for everything.</p>}
    </div>);
}

const MONEY_KEYS: Record<string, string> = { purchasesPaise: 'Purchases', returnsPaise: 'Returns', netPurchasesPaise: 'Net purchases', dairyDepositsPaise: 'Dairy deposits' };
const Chip = ({ k, children }: { k: string; children: React.ReactNode }) => <span className="rounded border border-line bg-paper px-3 py-1 text-sm"><span className="text-muted">{k}</span> <b>{children}</b></span>;

/** The extra facts a report carries next to its table. */
function MetaView({ meta }: { meta?: Record<string, any> }) {
  if (!meta) return null;
  const chips: React.ReactNode[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (MONEY_KEYS[k]) chips.push(<Chip key={k} k={MONEY_KEYS[k]}>{formatINR(v)}</Chip>);
    else if (k === 'byMode') for (const [m, p] of Object.entries<number>(v)) chips.push(<Chip key={k + m} k={m}>{formatINR(p)}</Chip>);
    else if (k === 'netQtyByType') for (const [m, q] of Object.entries<number>(v)) chips.push(<Chip key={k + m} k={m.replace('_', ' ').toLowerCase()}>{q > 0 ? `+${q}` : q}</Chip>);
    else if (k === 'netChange') chips.push(<Chip key={k} k="Cash">{formatINR(v.cashPaise)}</Chip>, <Chip key={k + 'g'} k="Fine gold">{grams(v.goldFineMg)}</Chip>, <Chip key={k + 's'} k="Fine silver">{grams(v.silverFineMg)}</Chip>);
    else if (k === 'rawStockNow') for (const s of v as any[]) chips.push(<Chip key={k + s.branch} k={`Raw stock now · ${s.branch}`}>{grams(s.netMg)} net · {grams(s.fineMg)} fine</Chip>);
  }
  const note = typeof meta.note === 'string' ? meta.note : '';
  return (chips.length || note) ? <div className="mb-3 flex flex-wrap items-center gap-2">{chips}{note && <span className="text-xs text-muted">{note}</span>}</div> : null;
}
