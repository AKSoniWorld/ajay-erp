import { useState } from 'react';
import { openPdf } from '@/lib/files';
import { useActiveBranch } from '@/lib/hooks';
import { Button } from './Button';

/** Opens a bill or receipt PDF on the paper the branch uses by default; the cashier can switch to A4 (full page) or A5 (half page) for this print. */
export function PrintButton({ path, kind, label = 'Print / open PDF', variant = 'primary' }: { path: string; kind: 'invoice' | 'receipt'; label?: string; variant?: 'primary' | 'ghost' }) {
  const branch = useActiveBranch(), def = kind === 'invoice' ? branch?.invoicePaper ?? 'A4' : branch?.receiptPaper ?? 'A5';
  const [pick, setPick] = useState<'' | 'A4' | 'A5'>(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const size = pick || def;
  const go = async () => { setBusy(true); setErr(''); try { await openPdf(path, size); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <div>
      <div className="flex items-stretch gap-1">
        <Button variant={variant} busy={busy} onClick={go} className="flex-1">{label}</Button>
        <select aria-label="Paper size" value={size} onChange={e => setPick(e.target.value as 'A4' | 'A5')} className="rounded border border-line bg-paper px-2 text-sm text-ink">
          <option value="A4">A4 · full page</option><option value="A5">A5 · half page</option>
        </select>
      </div>
      {err && <p className="mt-1 text-sm text-danger" role="alert">{err}</p>}
    </div>);
}
