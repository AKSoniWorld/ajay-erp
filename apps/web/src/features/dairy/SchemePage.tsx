import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openPdf } from '@/lib/files';
import { dateIST, dateTimeIST, formatINR, rupeesToPaise } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PrintButton } from '@/components/ui/PrintPdf';
import { Money } from '@/components/ui/Money';
import { num } from '@/features/pos/types';
import { STATUS_COLOR, STATUS_TEXT } from './DairyPage';

const KIND: Record<string, string> = { PAYMENT: 'Instalment paid', BONUS: 'Bonus added', INVOICE: 'Used on a bill', MANUAL: 'Correction' };

export function SchemePage() {
  const { id } = useParams(), role = useAuth(s => s.user!.role), qc = useQueryClient();
  const q = useQuery({ queryKey: ['scheme', id], queryFn: () => api(`/dairy/schemes/${id}`) });
  const [dlg, setDlg] = useState<null | 'collect' | 'adjust'>(null);
  const s = q.data;
  if (q.isError) return <div className="p-6 text-danger">{(q.error as Error).message}</div>;
  if (!s) return <div className="p-6 text-sm text-muted">Opening…</div>;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['scheme', id] }); qc.invalidateQueries({ queryKey: ['dairy-list'] }); };
  const left = s.durationMonths - s.paidMonths;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link to="/dairy" className="text-sm text-muted hover:underline">← Dairy savings</Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{s.schemeNo}</h1>
          <p className="text-sm text-muted"><Link to={`/customers/${s.customerId}`} className="underline">{s.customer?.name}</Link> · {formatINR(s.monthlyPaise, { decimals: false })} a month for {s.durationMonths} months · {s.schemeType === 'BONUS' ? `bonus ${s.bonusInstallments} instalment${s.bonusInstallments > 1 ? 's' : ''}` : 'no bonus'}</p>
          <p className="text-sm"><span className={STATUS_COLOR[s.status]}>{STATUS_TEXT[s.status]}</span><span className="text-muted"> · started {dateIST(s.startDate)} · ends {dateIST(s.maturityDate)}</span></p>
        </div>
        <div className="flex gap-2">
          {left > 0 && <Button variant="primary" onClick={() => setDlg('collect')}>Collect instalment</Button>}
          {role === 'ADMIN' && <Button onClick={() => setDlg('adjust')}>Correct balance</Button>}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[['Paid so far', <Money paise={s.paidPaise} />], ['Usable balance', <Money paise={s.balancePaise} strong />], ['Instalments', `${s.paidMonths} of ${s.durationMonths}`], ['Missed', <span className={s.missedMonths > 0 ? 'text-warn' : ''}>{s.missedMonths}</span>]]
          .map(([k, v], n) => <div key={n} className="rounded-lg border border-line bg-paper p-4"><div className="text-sm text-muted">{k as string}</div><div className="mt-1 text-xl font-semibold">{v}</div></div>)}
      </div>
      {s.schemeType === 'BONUS' && <p className="mt-3 text-sm text-muted">{s.bonusForfeited ? 'The bonus was cancelled because the savings were used before the scheme was complete.' : s.bonusCreditedAt ? 'The bonus has been added to the balance.' : 'The bonus is added when every instalment is paid — using the savings earlier cancels it.'}</p>}

      <h2 className="mt-8 font-medium">Payments</h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-paper"><table className="w-full text-sm"><tbody>
        {s.payments.map((p: any) => <tr key={p._id} className="border-b border-line last:border-0"><td className="p-3 text-muted whitespace-nowrap">{dateTimeIST(p.at)}</td><td className="p-3">{p.receiptNo}</td><td className="p-3 text-muted">{p.mode} · {p.monthsCovered} instalment{p.monthsCovered > 1 ? 's' : ''}</td><td className="p-3 text-right"><Money paise={p.amountPaise} /></td><td className="p-3 text-right"><Button variant="ghost" onClick={() => openPdf(`/dairy/receipts/${p.receiptNo}/pdf`)}>Receipt</Button></td></tr>)}
        {s.payments.length === 0 && <tr><td className="p-6 text-center text-muted">No payments yet.</td></tr>}</tbody></table></div>

      <h2 className="mt-8 font-medium">Balance history</h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-paper"><table className="w-full text-sm"><tbody>
        {s.ledger.map((e: any) => <tr key={e._id} className="border-b border-line last:border-0"><td className="p-3 text-muted whitespace-nowrap">{dateTimeIST(e.at)}</td><td className="p-3">{KIND[e.kind] ?? e.kind}{e.note && <div className="text-xs text-muted">{e.note}</div>}</td><td className="p-3 text-muted">{e.invoiceNumber ?? ''}</td>
          <td className="p-3 text-right"><Money paise={e.direction === 'DEBIT' ? -e.amountPaise : e.amountPaise} /></td><td className="p-3 text-right"><Money paise={e.balanceAfter} /></td></tr>)}</tbody></table></div>

      {dlg === 'collect' && <CollectDialog scheme={s} left={left} onClose={() => { setDlg(null); refresh(); }} />}
      {dlg === 'adjust' && <AdjustScheme id={s._id} onClose={() => setDlg(null)} onDone={() => { setDlg(null); refresh(); }} />}
    </div>
  );
}

/** Instalments are whole multiples of the monthly amount (advance payments allowed). */
function CollectDialog({ scheme, left, onClose }: { scheme: any; left: number; onClose: () => void }) {
  const [n, setN] = useState(1), [mode, setMode] = useState('CASH'), [ref, setRef] = useState('');
  const amount = n * scheme.monthlyPaise;
  const m = useMutation({ mutationFn: () => api<any>(`/dairy/schemes/${scheme._id}/payments`, { body: { amountPaise: amount, mode, ...(ref && { ref }) } }) });
  if (m.data) return (
    <Modal title="Receipt" onClose={onClose}>
      <p className="text-sm">Saved. Receipt <b>{m.data.receiptNo}</b>{m.data.scheme.status === 'COMPLETED' && ' — the scheme is now complete.'}</p>
      <div className="flex gap-2"><PrintButton kind="receipt" label="Print receipt" path={`/dairy/receipts/${m.data.receiptNo}/pdf`} /><Button onClick={onClose}>Done</Button></div>
    </Modal>);
  return (
    <Modal title="Collect instalment" onClose={onClose}>
      <Field label="How many instalments?" hint={`${left} left. Paying ahead is fine.`}><select className={inputCls} value={n} onChange={e => setN(Number(e.target.value))}>{Array.from({ length: left }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} × {formatINR(scheme.monthlyPaise, { decimals: false })}</option>)}</select></Field>
      <div className="text-lg font-semibold">{formatINR(amount)}</div>
      <Field label="Paid by"><select className={inputCls} value={mode} onChange={e => setMode(e.target.value)}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option></select></Field>
      <Field label="Reference (optional)"><Input value={ref} onChange={e => setRef(e.target.value)} /></Field>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} onClick={() => m.mutate()}>Collect and issue receipt</Button>
    </Modal>);
}

function AdjustScheme({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState('CREDIT'), [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const m = useMutation({ mutationFn: () => api('/dairy/adjustments', { body: { schemeId: id, type, amountPaise: rupeesToPaise(num(amount)), reason } }), onSuccess: onDone });
  return (
    <Modal title="Correct the balance" onClose={onClose}>
      <Field label="Change"><select className={inputCls} value={type} onChange={e => setType(e.target.value)}><option value="CREDIT">Add to the balance</option><option value="DEBIT">Take from the balance</option></select></Field>
      <Field label="Amount (₹)"><Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <Field label="Reason"><Input value={reason} onChange={e => setReason(e.target.value)} /></Field>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={num(amount) <= 0 || reason.trim().length < 3} onClick={() => m.mutate()}>Save correction</Button>
    </Modal>);
}
