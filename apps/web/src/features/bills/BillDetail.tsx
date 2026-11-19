import { hasPermission } from '@ajay/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTimeIST, formatINR, grams } from '@/lib/format';
import { useBranches } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Money } from '@/components/ui/Money';
import { PrintButton } from '@/components/ui/PrintPdf';
import { PaymentPanel, paise } from '@/features/pos/PaymentPanel';
import { PayRow } from '@/features/pos/types';
import { statusColor, statusText } from './BillsPage';

export function BillDetail() {
  const { id } = useParams(), role = useAuth(s => s.user!.role), qc = useQueryClient(), { data: branches } = useBranches();
  const inv = useQuery({ queryKey: ['invoice', id], queryFn: () => api(`/pos/invoices/${id}`) });
  const view = useQuery({ queryKey: ['invoice-view', id], queryFn: () => api(`/pos/invoices/${id}/customer-view`) });
  const [dialog, setDialog] = useState<'credit' | 'finalize' | 'cancel' | null>(null), [note, setNote] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['invoice', id] }); qc.invalidateQueries({ queryKey: ['invoice-view', id] }); qc.invalidateQueries({ queryKey: ['invoices'] }); setDialog(null); };
  const verify = useMutation({ mutationFn: () => api<{ ok: boolean }>(`/pos/invoices/${id}/verify`) });

  const b = inv.data, v = view.data;
  if (inv.isLoading) return <div className="p-6 text-sm text-muted">Opening the bill…</div>;
  if (inv.isError || !b) return <div className="p-6"><p className="text-danger">{(inv.error as Error)?.message ?? 'Bill not found'}</p><Link to="/invoices" className="underline">Back to bills</Link></div>;

  const t = b.totals ?? {}, internal = role !== 'STAFF', canVoid = hasPermission(role, 'invoice.void');
  const isFinalSale = b.status === 'FINAL' && b.type === 'SALE';
  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link to="/invoices" className="text-sm text-muted hover:underline">← Bills</Link>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{b.number ?? 'Draft bill'}</h1>
          <p className="text-sm text-muted"><span className={statusColor(b)}>{statusText(b)}</span> · {branches?.find((x: any) => x._id === b.branchId)?.name} · {dateTimeIST(b.finalizedAt ?? b.createdAt)}{b.taxMode === 'NON_GST' ? ' · bill of supply (no GST)' : ''}</p>
          {v?.document?.againstInvoice && <p className="text-sm text-muted">Against bill {v.document.againstInvoice}{v.document.reason ? ` — ${v.document.reason}` : ''}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton kind="invoice" variant="ghost" path={`/pos/invoices/${id}/pdf`} />
          {canVoid && b.status === 'FINAL' && <Button onClick={() => verify.mutate()} busy={verify.isPending}>Check integrity</Button>}
          {isFinalSale && canVoid && <Button variant="danger" onClick={() => setDialog('credit')}>Credit note</Button>}
          {b.status === 'DRAFT' && <Button variant="primary" onClick={() => setDialog('finalize')}>Finish this bill</Button>}
          {b.status === 'DRAFT' && <Button onClick={() => setDialog('cancel')}>Cancel draft</Button>}
        </div>
      </div>
      {verify.data && <p className={`mt-3 text-sm ${verify.data.ok ? 'text-ok' : 'text-danger'}`} role="status">{verify.data.ok ? 'Intact — the stored bill matches its seal.' : 'WARNING: this bill no longer matches its seal. Tell the administrator.'}</p>}
      {verify.error && <p className="mt-3 text-sm text-danger">{(verify.error as Error).message}</p>}
      {b.offline && <p className="mt-3 rounded border border-line bg-paper p-3 text-sm text-muted">Made offline on a device (receipt {b.provisionalNo}){b.negativeStock ? ' — stock went below zero when this was sent; please check the stock count.' : '.'}</p>}

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-paper p-4 text-sm"><div className="text-muted">Customer</div><div className="font-medium">{v?.customer?.name ?? '—'}</div><div className="text-muted">{v?.customer?.mobile}</div>{v?.customer?.address && <div className="text-muted">{v.customer.address}</div>}</div>
        <div className="rounded-lg border border-line bg-paper p-4 text-sm"><div className="text-muted">Net payable</div><div className="font-display text-3xl text-gold-deep">{formatINR(t.finalPayable)}</div>{b.duePaise > 0 && <div className="text-warn">{formatINR(b.duePaise)} left as customer due</div>}{b.advancePaise > 0 && <div className="text-muted">{formatINR(b.advancePaise)} paid from advance</div>}</div>
      </section>

      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Item</th><th className="p-3 text-right font-medium">Qty</th><th className="p-3 text-right font-medium">Amount</th></tr></thead>
          <tbody>{(b.lines ?? []).map((l: any) => (
            <tr key={String(l.productId)} className="border-b border-line last:border-0"><td className="p-3"><div className="font-medium">{l.name}</div><div className="text-xs text-muted">{l.sku}{l.karat ? ` · ${l.karat}K` : ''} · net {grams(l.netMg)}</div></td>
              <td className="p-3 text-right num">{l.qty}</td><td className="p-3 text-right"><Money paise={l.metalValue + l.stoneValue + l.making} /></td></tr>))}</tbody>
        </table>
      </div>

      <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
        <Row k="Jewellery" v={t.jewellery} /><Row k="Making charges" v={t.making} />
        {b.taxMode !== 'NON_GST' && <Row k="GST" v={t.gst} />}
        {t.goldExchange ? <Row k="Old gold" v={-t.goldExchange} /> : null}{t.silverExchange ? <Row k="Old silver" v={-t.silverExchange} /> : null}
        {t.dairy ? <Row k="Dairy savings" v={-t.dairy} /> : null}{t.roundOff ? <Row k="Round off" v={t.roundOff} /> : null}
        <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Net payable</dt><dd><Money paise={t.finalPayable} strong /></dd></div>
      </dl>

      {(b.payments?.length ?? 0) > 0 && (
        <section className="mt-6"><h2 className="font-medium">{b.type === 'CREDIT_NOTE' ? 'Refunded by' : 'Paid by'}</h2>
          <ul className="mt-1 max-w-xs text-sm">{b.payments.map((p: any, n: number) => <li key={n} className="flex justify-between border-b border-line py-1"><span>{p.mode}{p.ref ? ` · ${p.ref}` : ''}</span><Money paise={Math.abs(p.amountPaise)} /></li>)}</ul></section>)}

      {internal && (b.exchanges?.length ?? 0) > 0 && (
        <section className="mt-6"><h2 className="font-medium">Old metal taken <span className="text-xs font-normal text-muted">(not shown to the customer)</span></h2>
          <div className="mt-1 overflow-x-auto rounded-lg border border-line bg-paper"><table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-muted"><th className="p-2 font-medium">Metal</th><th className="p-2 text-right font-medium">Gross</th><th className="p-2 text-right font-medium">Less</th><th className="p-2 text-right font-medium">Net</th><th className="p-2 text-right font-medium">Purity</th><th className="p-2 text-right font-medium">Fine</th><th className="p-2 text-right font-medium">Rate /g</th><th className="p-2 text-right font-medium">Value</th></tr></thead>
            <tbody>{b.exchanges.map((e: any, n: number) => <tr key={n} className="border-b border-line last:border-0"><td className="p-2">{e.metal === 'GOLD' ? 'Gold' : 'Silver'}</td><td className="p-2 text-right num">{grams(e.grossMg)}</td><td className="p-2 text-right num">{grams(e.lessMg)}</td><td className="p-2 text-right num">{grams(e.netMg)}</td><td className="p-2 text-right num">{e.purityPct}%</td><td className="p-2 text-right num">{grams(e.fineMg)}</td><td className="p-2 text-right"><Money paise={e.ratePerGramPaise} /></td><td className="p-2 text-right"><Money paise={e.valuePaise} /></td></tr>)}</tbody></table></div></section>)}

      {dialog === 'credit' && <CreditNoteDialog bill={b} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'finalize' && <FinalizeDialog bill={b} role={role} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'cancel' && (
        <Modal title="Cancel this draft" onClose={() => setDialog(null)}>
          <Input autoFocus placeholder="Reason" value={note} onChange={e => setNote(e.target.value)} />
          <CancelButton id={id!} reason={note} onDone={refresh} />
        </Modal>)}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: number }) => <div className="flex justify-between"><dt className="text-muted">{k}</dt><dd><Money paise={v} /></dd></div>;

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-line bg-paper p-6">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-gold-wash">✕</button></div>
        {children}
      </div>
    </div>);
}

function CancelButton({ id, reason, onDone }: { id: string; reason: string; onDone: () => void }) {
  const m = useMutation({ mutationFn: () => api(`/pos/invoices/${id}/cancel`, { body: { reason } }), onSuccess: onDone });
  return <>{m.error && <p className="text-sm text-danger">{(m.error as Error).message}</p>}<Button variant="danger" disabled={reason.trim().length < 3} busy={m.isPending} onClick={() => m.mutate()}>Cancel the draft</Button></>;
}

/** Full reversal of a finished bill: stock comes back, a numbered credit note is issued, the refund is recorded. */
function CreditNoteDialog({ bill, onClose, onDone }: { bill: any; onClose: () => void; onDone: () => void }) {
  const total = bill.totals.finalPayable;
  const [reason, setReason] = useState(''), [rows, setRows] = useState<PayRow[]>([{ mode: 'UPI', text: (total / 100).toFixed(2) }]);
  const refunded = rows.reduce((s, r) => s + paise(r), 0);
  const m = useMutation({ mutationFn: () => api(`/pos/invoices/${bill._id}/credit-note`, { body: { reason, refunds: rows.map(r => ({ mode: r.mode, amountPaise: paise(r) })).filter(r => r.amountPaise > 0) } }), onSuccess: onDone });
  return (
    <Modal title="Credit note" onClose={onClose}>
      <p className="text-sm text-muted">This reverses the whole bill ({formatINR(total)}) and returns the items to stock. Bills that used old metal, dairy, advance or left a due need to be handled by hand.</p>
      <Input autoFocus placeholder="Reason for the return" value={reason} onChange={e => setReason(e.target.value)} />
      <PaymentPanel title="Refund" rows={rows} onChange={setRows} payable={total} />
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="danger" className="w-full" disabled={reason.trim().length < 3 || refunded !== total} busy={m.isPending} onClick={() => m.mutate()}>Issue credit note</Button>
    </Modal>);
}

/** Finish a draft — for example one the server held back after an offline sync. */
function FinalizeDialog({ bill, role, onClose, onDone }: { bill: any; role: string; onClose: () => void; onDone: () => void }) {
  const toCollect = bill.totals.finalPayable - (bill.advancePaise ?? 0);
  const [rows, setRows] = useState<PayRow[]>([{ mode: 'UPI', text: (toCollect / 100).toFixed(2) }]), [due, setDue] = useState(false);
  const paid = rows.reduce((s, r) => s + paise(r), 0), left = toCollect - paid;
  const m = useMutation({ mutationFn: () => api(`/pos/invoices/${bill._id}/finalize`, { body: { payments: rows.map(r => ({ mode: r.mode, amountPaise: paise(r) })).filter(r => r.amountPaise > 0), ...(due && { allowDue: true }) } }), onSuccess: onDone });
  const reprice = useMutation({ mutationFn: () => api(`/pos/invoices/${bill._id}`, { method: 'PATCH', body: { lines: bill.lines.map((l: any) => ({ productId: String(l.productId), qty: l.qty })) } }), onSuccess: onDone });
  const changed = (m.error as any)?.code === 'PRICE_CHANGED';
  return (
    <Modal title="Finish this bill" onClose={onClose}>
      <div className="flex justify-between text-sm"><span className="text-muted">Net payable</span><b>{formatINR(bill.totals.finalPayable)}</b></div>
      {bill.advancePaise > 0 && <div className="flex justify-between text-sm"><span className="text-muted">Paid from advance</span><span>{formatINR(bill.advancePaise)}</span></div>}
      <PaymentPanel rows={rows} onChange={setRows} payable={toCollect} />
      {role !== 'STAFF' && left > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={due} onChange={e => setDue(e.target.checked)} />Leave {formatINR(left)} as customer due</label>}
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      {changed && <Button onClick={() => reprice.mutate()} busy={reprice.isPending}>Re-price the draft with today’s rates</Button>}
      <Button variant="primary" className="w-full" disabled={left !== 0 && !(due && left > 0)} busy={m.isPending} onClick={() => m.mutate()}>Finish bill</Button>
    </Modal>);
}
