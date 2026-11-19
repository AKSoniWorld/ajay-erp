import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { inputCls } from '@/components/ui/Field';
import { KeyHint } from '@/components/ui/Status';
import { DEFAULT_PURITY, ExRow, gToMg, num, toExchange } from './types';

/**
 * Old gold / silver the customer gives. Fine weight = net weight × purity %; the value is fine weight × the admin's exchange rate
 * (priced by the server — see "Value"). Weights are typed in grams.
 */
export function ExchangePanel({ rows, onChange, priced, firstRef }: { rows: ExRow[]; onChange: (r: ExRow[]) => void; priced?: any[]; firstRef: React.Ref<HTMLInputElement> }) {
  const set = (i: number, patch: Partial<ExRow>) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  let k = 0;                                                       // the server prices only the valid rows, in order
  return (
    <section>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">Old gold &amp; silver <KeyHint k="F4" /></div>
      {rows.length === 0 && <p className="text-sm text-muted">Customer giving old gold or silver? Add it here and its value comes off the bill.</p>}
      <div className="space-y-3">
        {rows.map((r, i) => {
          const valid = !!toExchange(r), server = valid ? priced?.[k++] : undefined;
          const net = Math.max(gToMg(r.gross) - gToMg(r.less), 0), fine = Math.round((net * num(r.purity)) / 100);
          return (
            <div key={i} className="rounded border border-line bg-paper p-3">
              <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-2">
                <select aria-label="Metal" value={r.metal} className={`${inputCls} w-24`}
                  onChange={e => { const m = e.target.value as ExRow['metal']; set(i, { metal: m, purity: r.purity === DEFAULT_PURITY[r.metal] ? DEFAULT_PURITY[m] : r.purity }); }}>
                  <option value="GOLD">Gold</option><option value="SILVER">Silver</option>
                </select>
                <label className="text-xs text-muted">Gross g<input ref={i === 0 ? firstRef : undefined} inputMode="decimal" value={r.gross} onChange={e => set(i, { gross: e.target.value })} className={`${inputCls} num mt-0.5`} /></label>
                <label className="text-xs text-muted">Less g<input inputMode="decimal" value={r.less} onChange={e => set(i, { less: e.target.value })} className={`${inputCls} num mt-0.5`} /></label>
                <label className="text-xs text-muted">Purity %<input inputMode="decimal" value={r.purity} onChange={e => set(i, { purity: e.target.value })} className={`${inputCls} num mt-0.5`} /></label>
                <Button variant="ghost" onClick={() => onChange(rows.filter((_, n) => n !== i))} aria-label="Remove old metal">✕</Button>
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-sm">
                <span className="text-muted">Net {(net / 1000).toFixed(3)} g · Fine {(fine / 1000).toFixed(3)} g</span>
                <span>{valid ? <>Value <b className="num">{server ? formatINR(server.valuePaise) : '…'}</b></> : <span className="text-muted">{r.gross ? 'Check the weights and purity' : 'Enter the weights'}</span>}</span>
              </div>
            </div>);
        })}
      </div>
      <button className="mt-2 text-sm text-gold-deep underline" onClick={() => onChange([...rows, { metal: 'GOLD', gross: '', less: '', purity: DEFAULT_PURITY.GOLD }])}>Add old gold or silver</button>
    </section>);
}
