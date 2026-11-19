import { formatINR, rupeesToPaise } from '@/lib/format';
import { inputCls } from '@/components/ui/Field';
import { KeyHint } from '@/components/ui/Status';
import { DairyRow, num } from './types';

export interface SchemeLite { schemeId: string; schemeNo: string; balancePaise: number; status: string; forfeitsBonusIfUsed: boolean }

/** Dairy savings the customer wants to use on this bill. Usable any time — using a bonus scheme before it is complete cancels its bonus. */
export function DairyPanel({ schemes, rows, onChange, firstRef }: { schemes: SchemeLite[]; rows: DairyRow[]; onChange: (r: DairyRow[]) => void; firstRef: React.Ref<HTMLInputElement> }) {
  const row = (id: string) => rows.find(r => r.schemeId === id) ?? { schemeId: id, text: '', confirm: false };
  const set = (id: string, patch: Partial<DairyRow>) => onChange([...rows.filter(r => r.schemeId !== id), { ...row(id), ...patch }]);
  return (
    <section>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">Dairy savings <KeyHint k="F5" /></div>
      <div className="space-y-3">
        {schemes.map((s, i) => {
          const r = row(s.schemeId), amt = rupeesToPaise(num(r.text));
          return (
            <div key={s.schemeId} className="rounded border border-line bg-paper p-3">
              <div className="flex justify-between text-sm"><span>{s.schemeNo}</span><span className="text-muted">Balance {formatINR(s.balancePaise)}</span></div>
              <div className="mt-2 flex gap-2">
                <input ref={i === 0 ? firstRef : undefined} aria-label={`Use from ${s.schemeNo}`} inputMode="decimal" placeholder="₹ to use" value={r.text} onChange={e => set(s.schemeId, { text: e.target.value })} className={`${inputCls} num`} />
                <button className="whitespace-nowrap text-sm text-gold-deep underline" onClick={() => set(s.schemeId, { text: (s.balancePaise / 100).toFixed(2) })}>Use all</button>
              </div>
              {amt > s.balancePaise && <p className="mt-1 text-sm text-danger">More than the balance.</p>}
              {s.forfeitsBonusIfUsed && amt > 0 && (
                <label className="mt-2 flex items-start gap-2 text-sm text-warn">
                  <input type="checkbox" className="mt-1" checked={r.confirm} onChange={e => set(s.schemeId, { confirm: e.target.checked })} />
                  This scheme is not complete yet. Using it now cancels its bonus. Tick to confirm.
                </label>)}
            </div>);
        })}
      </div>
    </section>);
}

/** Money the customer paid us earlier (advance) and wants to adjust against this bill. */
export function AdvancePanel({ balance, text, onChange, max }: { balance: number; text: string; onChange: (t: string) => void; max: number }) {
  return (
    <section>
      <div className="mb-2 text-sm font-medium">Advance paid earlier</div>
      <div className="rounded border border-line bg-paper p-3">
        <div className="flex justify-between text-sm"><span className="text-muted">Balance</span><span>{formatINR(balance)}</span></div>
        <div className="mt-2 flex gap-2">
          <input aria-label="Advance to use" inputMode="decimal" placeholder="₹ to use" value={text} onChange={e => onChange(e.target.value)} className={`${inputCls} num`} />
          <button className="whitespace-nowrap text-sm text-gold-deep underline" onClick={() => onChange((Math.min(balance, max) / 100).toFixed(2))}>Use all</button>
        </div>
      </div>
    </section>);
}
