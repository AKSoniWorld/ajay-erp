import { hasPermission } from '@ajay/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTimeIST } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Money } from '@/components/ui/Money';
import { OutboxOp, deleteOp, outbox, putOp } from '@/offline/db';
import { useSync } from '@/offline/store';
import { syncNow } from '@/offline/sync';

const badge: Record<string, string> = { PENDING: 'text-gold-deep', SENDING: 'text-gold-deep', APPLIED: 'text-ok', NEEDS_REVIEW: 'text-warn', FAILED: 'text-danger' };
const word: Record<string, string> = { PENDING: 'Waiting to send', SENDING: 'Sending…', APPLIED: 'Sent', NEEDS_REVIEW: 'Sent — needs review', FAILED: 'Not accepted' };

export function SyncPage() {
  const user = useAuth(s => s.user)!, { counts, syncing } = useSync();
  const [ops, setOps] = useState<OutboxOp[]>([]);
  useEffect(() => { let on = true; const load = async () => on && setOps((await outbox()).reverse()); load(); const t = setInterval(load, 2500); return () => { on = false; clearInterval(t); }; }, [counts]);
  const refresh = async () => { setOps((await outbox()).reverse()); await useSync.getState().refresh(); };
  const retry = async (o: OutboxOp) => { await putOp({ ...o, status: 'PENDING', error: undefined }); await refresh(); void syncNow(); };
  const discard = async (o: OutboxOp) => { if (window.confirm('Discard this item? It will not be sent.')) { await deleteOp(o.clientUuid); await refresh(); } };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Sync</h1>
        <Button onClick={() => void syncNow()} busy={syncing}>Sync now</Button>
      </div>
      <p className="mt-1 text-sm text-muted">Bills made while offline are kept on this device and sent automatically when the internet is back.</p>

      <h2 className="mt-6 font-medium">On this device</h2>
      {ops.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing waiting. Everything has been sent.</p> : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-paper">
          <table className="w-full text-sm">
            <tbody>{ops.map(o => (
              <tr key={o.clientUuid} className="border-b border-line align-top last:border-0">
                <td className="p-3 text-muted whitespace-nowrap">{dateTimeIST(new Date(o.createdAt))}</td>
                <td className="p-3"><div className="font-medium">{o.label}</div>{o.provisionalNo && <div className="text-xs text-muted">{o.provisionalNo}{o.result?.invoiceNumber ? ` → ${o.result.invoiceNumber}` : ''}</div>}
                  {o.error && <div className="mt-1 text-xs text-danger">{o.error}</div>}</td>
                <td className="p-3 text-right">{o.amountPaise !== undefined && <Money paise={o.amountPaise} />}</td>
                <td className={`p-3 whitespace-nowrap ${badge[o.status]}`}>{word[o.status]}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {o.status === 'FAILED' && <><Button variant="ghost" onClick={() => retry(o)}>Try again</Button><Button variant="ghost" onClick={() => discard(o)}>Discard</Button></>}
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>)}

      {(user.role === 'ADMIN' || user.role === 'OWNER') && hasPermission(user.role, 'invoice.void') && <ReviewQueue />}
    </div>
  );
}

/** Bills sent from a device that the server could not finish by itself (price differs, no stock record, dairy short…). */
function ReviewQueue() {
  const qc = useQueryClient(), [note, setNote] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ['sync-ops'], queryFn: () => api<{ items: any[] }>('/sync/ops'), refetchInterval: 30_000 });
  const resolve = useMutation({ mutationFn: (id: string) => api(`/sync/ops/${id}/resolve`, { body: { note: note[id] } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sync-ops'] }) });
  const items = q.data?.items ?? [];
  return (
    <section className="mt-10">
      <h2 className="font-medium">Needs your decision</h2>
      <p className="mt-1 text-sm text-muted">The server kept these as drafts. Finish or correct the bill, then mark the item as handled.</p>
      {items.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing to review.</p> : (
        <div className="mt-2 space-y-3">{items.map(o => (
          <div key={o._id} className="rounded-lg border border-line bg-paper p-4 text-sm">
            <div className="flex justify-between gap-3"><b>{o.type === 'SALE' ? 'Bill' : 'Dairy payment'} {o.result?.provisionalNo ?? ''}</b><span className="text-muted">{dateTimeIST(o.createdAt)} · {o.status === 'FAILED' ? 'not accepted' : 'needs review'}</span></div>
            <p className="mt-1 text-danger">{o.error}</p>
            {o.result?.invoiceId && <Link to={`/invoices/${o.result.invoiceId}`} className="mt-1 inline-block text-gold-deep underline">Open the held bill</Link>}
            <div className="mt-3 flex gap-2">
              <Input placeholder="What was done about it?" value={note[o._id] ?? ''} onChange={e => setNote({ ...note, [o._id]: e.target.value })} />
              <Button disabled={(note[o._id] ?? '').trim().length < 3} busy={resolve.isPending} onClick={() => resolve.mutate(o._id)}>Mark handled</Button>
            </div>
          </div>))}
        </div>)}
    </section>
  );
}
