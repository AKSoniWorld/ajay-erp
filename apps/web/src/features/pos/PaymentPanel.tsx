import { formatINR, rupeesToPaise } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { inputCls } from '@/components/ui/Field';
import { KeyHint } from '@/components/ui/Status';
import type { PayRow } from './types';

export const paise = (r: PayRow) => (isNaN(parseFloat(r.text)) ? 0 : rupeesToPaise(parseFloat(r.text)));

/** One or more payments that must add up to the net payable. */
export function PaymentPanel({ rows, onChange, payable, firstRef, title = 'Payment' }: { rows: PayRow[]; onChange: (r: PayRow[]) => void; payable: number; firstRef?: React.Ref<HTMLInputElement>; title?: string }) {
  const paid = rows.reduce((s, r) => s + paise(r), 0), left = payable - paid;
  const set = (i: number, patch: Partial<PayRow>) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">{title} {title === 'Payment' && <KeyHint k="F8" />}</div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <select aria-label="Payment mode" value={r.mode} onChange={e => set(i, { mode: e.target.value as PayRow['mode'] })} className={`${inputCls} w-28`}>
              <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option>
            </select>
            <input ref={i === 0 ? firstRef : undefined} inputMode="decimal" aria-label="Amount" value={r.text} onChange={e => set(i, { text: e.target.value })} className={`${inputCls} num`} />
            {rows.length > 1 && <Button variant="ghost" onClick={() => onChange(rows.filter((_, n) => n !== i))} aria-label="Remove payment">✕</Button>}
          </div>))}
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <button className="text-gold-deep underline" onClick={() => onChange([...rows, { mode: 'UPI', text: left > 0 ? (left / 100).toFixed(2) : '' }])}>Split payment</button>
        <span className={left === 0 ? 'text-ok' : left > 0 ? 'text-warn' : 'text-danger'}>
          {left === 0 ? 'Fully paid' : left > 0 ? `${formatINR(left)} still to pay` : `${formatINR(-left)} too much`}
        </span>
      </div>
    </div>);
}
