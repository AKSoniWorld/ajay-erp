import { hasPermission } from '@ajay/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTimeIST } from '@/lib/format';
import { useBranches } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ProductPicker } from '@/features/products/ProductPicker';

const STATUS: Record<string, [string, string]> = {
  PENDING: ['Waiting for approval', 'text-warn'], APPROVED: ['Approved — ready to send', 'text-gold-deep'], IN_TRANSIT: ['On the way', 'text-gold-deep'],
  RECEIVED: ['Received', 'text-ok'], REJECTED: ['Rejected', 'text-danger'], CANCELLED: ['Cancelled', 'text-muted'] };

export function TransfersPage() {
  const { data: branches } = useBranches(), [status, setStatus] = useState(''), [page, setPage] = useState(1), [creating, setCreating] = useState(false), [openId, setOpenId] = useState('');
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['transfers', status, page], queryFn: () => api('/transfers', { query: { status, page, limit: 20 } }), placeholderData: keepPreviousData });
  const items: any[] = list.data?.items ?? [], pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  const name = (id: string) => branches?.find(b => b._id === id)?.name ?? '…';
  const refresh = () => { qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['stock'] }); };
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-3"><h1 className="font-display text-2xl">Transfers between branches</h1><Button variant="primary" onClick={() => setCreating(true)}>New transfer</Button></div>
      <p className="mt-1 text-sm text-muted">Stock leaves the sending branch when it is handed over and reaches the other branch only when they confirm receipt.</p>
      <select aria-label="Status" className={`${inputCls} mt-4 !w-auto`} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Transfer</th><th className="p-3 font-medium">From → To</th><th className="p-3 text-right font-medium">Pieces</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Started</th></tr></thead>
          <tbody>{items.map(t => (
            <tr key={t._id} className="cursor-pointer border-b border-line last:border-0 hover:bg-gold-wash" onClick={() => setOpenId(t._id)}>
              <td className="p-3 font-medium">{t.number}</td><td className="p-3">{name(t.fromBranchId)} → {name(t.toBranchId)}</td>
              <td className="p-3 text-right num">{t.items.reduce((s: number, i: any) => s + i.qty, 0)}</td><td className={`p-3 ${STATUS[t.status][1]}`}>{STATUS[t.status][0]}</td>
              <td className="p-3 whitespace-nowrap text-muted">{dateTimeIST(t.createdAt)}</td></tr>))}
            {!list.isLoading && items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">No transfers yet.</td></tr>}</tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted"><span>{list.data?.total ?? 0} transfers</span>
        <span className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></span></div>
      {creating && <NewTransfer onClose={() => setCreating(false)} onDone={t => { refresh(); setCreating(false); setOpenId(t._id); }} />}
      {openId && <TransferDialog id={openId} name={name} onClose={() => setOpenId('')} onChanged={refresh} />}
    </div>
  );
}

function NewTransfer({ onClose, onDone }: { onClose: () => void; onDone: (t: any) => void }) {
  const user = useAuth(s => s.user!), { data: branches } = useBranches();
  const mine = branches?.filter(b => user.role === 'ADMIN' || user.branchIds.includes(b._id)) ?? [];
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [note, setNote] = useState(''), [lines, setLines] = useState<{ p: any; qty: number }[]>([]);
  const src = from || mine[0]?._id || '';
  const add = (p: any) => setLines(ls => (ls.some(l => l.p._id === p._id) ? ls : [...ls, { p, qty: 1 }]));
  const set = (id: string, qty: number) => setLines(ls => ls.map(l => (l.p._id === id ? { ...l, qty: Math.max(1, Math.min(1000, qty || 1)) } : l)));
  const m = useMutation({ mutationFn: () => api('/transfers', { body: { fromBranchId: src, toBranchId: to, items: lines.map(l => ({ productId: l.p._id, qty: l.qty })), ...(note && { note }) } }), onSuccess: onDone });
  return (
    <Modal title="New transfer" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><select className={inputCls} value={src} onChange={e => { setFrom(e.target.value); setLines([]); }}>{mine.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></Field>
        <Field label="To"><select className={inputCls} value={to} onChange={e => setTo(e.target.value)}><option value="">Choose…</option>{branches?.filter(b => b._id !== src).map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></Field>
      </div>
      <ProductPicker branchId={src} onPick={add} />
      <ul className="divide-y divide-line">{lines.map(l => (
        <li key={l.p._id} className="flex items-center gap-2 py-2 text-sm"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{l.p.name}</span><span className="text-xs text-muted">{l.p.sku} · {l.p.stockQty ?? 0} here</span></span>
          <input type="number" min={1} aria-label={`Pieces of ${l.p.name}`} className={`${inputCls} num !w-20`} value={l.qty} onChange={e => set(l.p._id, Number(e.target.value))} />
          <button aria-label={`Remove ${l.p.name}`} className="text-muted hover:text-danger" onClick={() => setLines(ls => ls.filter(x => x.p._id !== l.p._id))}>✕</button></li>))}</ul>
      <Field label="Note (optional)"><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={!to || !lines.length} onClick={() => m.mutate()}>Create transfer</Button>
    </Modal>);
}

function TransferDialog({ id, name, onClose, onChanged }: { id: string; name: (id: string) => string; onClose: () => void; onChanged: () => void }) {
  const user = useAuth(s => s.user!), qc = useQueryClient();
  const q = useQuery({ queryKey: ['transfer', id], queryFn: () => api<any>(`/transfers/${id}`) });
  const [reason, setReason] = useState(''), [asking, setAsking] = useState<'reject' | 'cancel' | null>(null);
  const act = useMutation({
    mutationFn: ({ verb, body }: { verb: string; body?: object }) => api(`/transfers/${id}/${verb}`, { method: 'POST', body: body ?? {} }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfer', id] }); onChanged(); setAsking(null); setReason(''); },
  });
  const t = q.data;
  if (!t) return <Modal title="Transfer" onClose={onClose}><p className="text-sm text-muted">{q.isError ? (q.error as Error).message : 'Opening…'}</p></Modal>;
  const at = (b: string) => user.role === 'ADMIN' || user.branchIds.includes(b);
  const canApprove = hasPermission(user.role, 'transfer.approve'), [label, color] = STATUS[t.status];
  return (
    <Modal title={t.number} onClose={onClose}>
      <p className="text-sm">{name(t.fromBranchId)} → {name(t.toBranchId)} · <span className={color}>{label}</span></p>
      <table className="w-full text-sm"><tbody>{t.items.map((i: any) => <tr key={String(i.productId)} className="border-b border-line"><td className="py-1.5"><div className="font-medium">{i.name}</div><div className="text-xs text-muted">{i.sku}</div></td><td className="py-1.5 text-right num">{i.qty}</td></tr>)}</tbody></table>
      {t.note && <p className="text-sm text-muted">{t.note}</p>}
      <ol className="space-y-1 text-xs text-muted">{t.history.map((h: any, n: number) => <li key={n}>{dateTimeIST(h.at)} — {STATUS[h.status][0]}{h.note ? ` (${h.note})` : ''}</li>)}</ol>
      {act.error && <p className="text-sm text-danger" role="alert">{(act.error as Error).message}</p>}

      {asking ? (
        <div className="space-y-2"><Input autoFocus placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
          <div className="flex gap-2"><Button variant="danger" busy={act.isPending} disabled={reason.trim().length < 3} onClick={() => act.mutate({ verb: asking, body: { reason } })}>{asking === 'reject' ? 'Reject' : 'Cancel the transfer'}</Button><Button onClick={() => setAsking(null)}>Back</Button></div></div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {t.status === 'PENDING' && canApprove && <Button variant="primary" busy={act.isPending} onClick={() => act.mutate({ verb: 'approve' })}>Approve</Button>}
          {t.status === 'APPROVED' && at(t.fromBranchId) && <Button variant="primary" busy={act.isPending} onClick={() => act.mutate({ verb: 'dispatch' })}>Handed over — send</Button>}
          {t.status === 'IN_TRANSIT' && at(t.toBranchId) && <Button variant="primary" busy={act.isPending} onClick={() => act.mutate({ verb: 'receive' })}>Goods received</Button>}
          {['PENDING', 'APPROVED'].includes(t.status) && canApprove && <Button onClick={() => setAsking('reject')}>Reject</Button>}
          {['PENDING', 'APPROVED'].includes(t.status) && <Button variant="ghost" onClick={() => setAsking('cancel')}>Cancel</Button>}
        </div>)}
    </Modal>);
}
