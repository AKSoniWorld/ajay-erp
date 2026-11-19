import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api } from '@/lib/api';
import { dateTimeIST } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { inputCls } from '@/components/ui/Field';

const ENTITIES = ['Auth', 'Branches', 'Users', 'Rates', 'Products', 'Categories', 'Inventory', 'Customers', 'Pos', 'Dairy', 'Accounts', 'Suppliers', 'Purchases', 'Transfers', 'Exchange', 'Sync'];

/** Who changed what, and when. Passwords and tokens are never recorded. */
export function AuditPage() {
  const [entity, setEntity] = useState(''), [actorId, setActor] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(1), [open, setOpen] = useState('');
  const users = useQuery({ queryKey: ['users-all'], queryFn: () => api<{ items: any[] }>('/users', { query: { limit: 100 } }), staleTime: 60_000 });
  const who = (id?: string) => users.data?.items.find(u => u._id === id)?.name ?? (id ? 'Unknown' : 'Not signed in');
  const list = useQuery({
    queryKey: ['audit', entity, actorId, from, to, page],
    queryFn: () => api('/audit', { query: { entity, actorId, from: from && `${from}T00:00:00+05:30`, to: to && `${to}T23:59:59+05:30`, page, limit: 25 } }),
    placeholderData: keepPreviousData,
  });
  const items: any[] = list.data?.items ?? [], pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 25));
  const reset = (f: () => void) => { f(); setPage(1); };
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="font-display text-2xl">Audit trail</h1>
      <p className="mt-1 text-sm text-muted">Every change made in the system, who made it and when. It cannot be edited or deleted.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <select aria-label="Area" className={`${inputCls} !w-auto`} value={entity} onChange={e => reset(() => setEntity(e.target.value))}><option value="">All areas</option>{ENTITIES.map(e => <option key={e}>{e}</option>)}</select>
        <select aria-label="Person" className={`${inputCls} !w-auto`} value={actorId} onChange={e => reset(() => setActor(e.target.value))}><option value="">Everyone</option>{users.data?.items.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}</select>
        <label className="flex items-center gap-2 text-sm text-muted">From <input type="date" className={`${inputCls} !w-auto`} value={from} onChange={e => reset(() => setFrom(e.target.value))} /></label>
        <label className="flex items-center gap-2 text-sm text-muted">To <input type="date" className={`${inputCls} !w-auto`} value={to} onChange={e => reset(() => setTo(e.target.value))} /></label>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Who</th><th className="p-3 font-medium">What</th><th className="p-3 font-medium">Area</th><th className="p-3 font-medium">Record</th></tr></thead>
          <tbody>{items.map(a => (
            <Fragment key={a._id}>
              <tr className="cursor-pointer border-b border-line hover:bg-gold-wash" onClick={() => setOpen(open === a._id ? '' : a._id)}>
                <td className="p-3 whitespace-nowrap text-muted">{dateTimeIST(a.at)}</td><td className="p-3">{who(a.actorId)}<span className="ml-2 text-xs text-muted">{a.role}</span></td>
                <td className="p-3">{a.action}</td><td className="p-3">{a.entity}</td><td className="p-3 text-xs text-muted">{a.entityId}</td></tr>
              {open === a._id && (
                <tr className="border-b border-line bg-canvas"><td colSpan={5} className="p-3"><div className="grid gap-3 md:grid-cols-2">
                  <div><div className="mb-1 text-xs text-muted">Before</div><pre className="max-h-64 overflow-auto rounded border border-line bg-paper p-2 text-xs">{a.before ? JSON.stringify(a.before, null, 2) : '—'}</pre></div>
                  <div><div className="mb-1 text-xs text-muted">After / sent</div><pre className="max-h-64 overflow-auto rounded border border-line bg-paper p-2 text-xs">{a.after ? JSON.stringify(a.after, null, 2) : '—'}</pre></div>
                </div>{a.ip && <div className="mt-2 text-xs text-muted">From {a.ip}</div>}</td></tr>)}
            </Fragment>))}
            {!list.isLoading && items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">Nothing recorded for this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted"><span>{list.data?.total ?? 0} entries</span>
        <span className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></span></div>
    </div>
  );
}
