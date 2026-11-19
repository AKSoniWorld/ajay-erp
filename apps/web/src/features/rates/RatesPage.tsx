import { hasPermission } from '@ajay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTimeIST, formatINR, rupeesToPaise } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { GRADES, KIND_LABEL, RateKind, useRates, type Grade } from './useRates';

export function RatesPage() {
  const user = useAuth(s => s.user)!, canSet = hasPermission(user.role, 'rate.set');
  const { data, isLoading } = useRates();
  const [edit, setEdit] = useState<{ g: Grade; kind: RateKind } | null>(null);
  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="font-display text-2xl">Rates</h1>
      <p className="mt-1 text-sm text-muted">
        Per gram. Selling rates price new bills, the old-metal rate values exchanged gold and silver, and the supplier rate converts cash to fine weight.
        {canSet ? ' Click a rate to change it.' : ' Only the admin can change rates.'}
      </p>
      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted">
            <th className="p-3 font-medium">Grade</th>
            {(['SALE', 'EXCHANGE', 'MARKET'] as RateKind[]).map(k => <th key={k} className="p-3 text-right font-medium">{KIND_LABEL[k]}</th>)}
          </tr></thead>
          <tbody>{GRADES.map(g => (
            <tr key={g.key} className="border-b border-line last:border-0">
              <td className="p-3 font-medium">{g.label}</td>
              {(['SALE', 'EXCHANGE', 'MARKET'] as RateKind[]).map(k => {
                if (!g.kinds.includes(k)) return <td key={k} className="p-3 text-right text-muted">—</td>;
                const c = data?.[g.key]?.[k];
                const active = edit?.g.key === g.key && edit.kind === k;
                return (
                  <td key={k} className="p-2 text-right">
                    <button disabled={!canSet} onClick={() => setEdit({ g, kind: k })}
                      className={`rounded px-2 py-1 text-right enabled:hover:bg-gold-wash ${active ? 'bg-gold-wash ring-1 ring-gold' : ''}`}>
                      <div className={`num font-semibold ${c ? '' : 'text-muted'}`}>{isLoading ? '…' : c ? formatINR(c.ratePerGramPaise) : 'not set'}</div>
                      {c && <div className="text-xs text-muted">{dateTimeIST(c.at)}</div>}
                    </button>
                  </td>
                );
              })}
            </tr>))}
          </tbody>
        </table>
      </div>
      {edit && canSet && <RateEditor key={`${edit.g.key}${edit.kind}`} g={edit.g} kind={edit.kind} onDone={() => setEdit(null)} />}
    </div>
  );
}

function RateEditor({ g, kind, onDone }: { g: Grade; kind: RateKind; onDone: () => void }) {
  const qc = useQueryClient();
  const [rupees, setRupees] = useState(''), [reason, setReason] = useState(''), [confirm, setConfirm] = useState(false), [needsConfirm, setNeedsConfirm] = useState(false);
  const save = useMutation({
    mutationFn: () => api('/rates', { body: { metal: g.metal, ...(g.karat && { karat: g.karat }), kind, ratePerGramPaise: rupeesToPaise(Number(rupees)), reason, ...(confirm && { confirmLargeChange: true }) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rates'] }); onDone(); },
    onError: e => { if (e instanceof ApiError && /more than 10%/.test(e.message)) setNeedsConfirm(true); },
  });
  const valid = Number(rupees) > 0 && reason.trim().length >= 3;
  return (
    <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="mt-5 rounded-lg border border-gold bg-gold-wash p-5">
      <h2 className="font-medium">{g.label} · {KIND_LABEL[kind]}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="New rate (₹ per gram)"><Input autoFocus inputMode="decimal" value={rupees} onChange={e => setRupees(e.target.value)} placeholder="e.g. 7450.00" /></Field>
        <Field label="Reason" hint="Kept in the rate history"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Morning market rate" /></Field>
      </div>
      {needsConfirm && (
        <label className="mt-4 flex items-start gap-2 text-sm text-warn">
          <input type="checkbox" className="mt-1" checked={confirm} onChange={e => setConfirm(e.target.checked)} />
          This is more than 10% different from the current rate. Tick to confirm it is correct.
        </label>)}
      {save.error && !needsConfirm && <p className="mt-3 text-sm text-danger">{(save.error as Error).message}</p>}
      <div className="mt-5 flex gap-3">
        <Button type="submit" variant="primary" busy={save.isPending} disabled={!valid || (needsConfirm && !confirm)}>Save rate</Button>
        <Button type="button" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
