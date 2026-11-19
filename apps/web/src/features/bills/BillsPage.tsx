import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTimeIST } from '@/lib/format';
import { useBranches, useDebounced } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Input, inputCls } from '@/components/ui/Field';
import { Money } from '@/components/ui/Money';

export const statusText = (i: any) => (i.type === 'CREDIT_NOTE' ? 'Credit note' : i.status === 'FINAL' ? 'Final' : i.status === 'DRAFT' ? 'Draft' : 'Cancelled');
export const statusColor = (i: any) => (i.status === 'DRAFT' ? 'text-warn' : i.status === 'CANCELLED' ? 'text-muted' : i.type === 'CREDIT_NOTE' ? 'text-danger' : 'text-ok');

export function BillsPage() {
  const role = useAuth(s => s.user!.role), nav = useNavigate(), { data: branches } = useBranches();
  const [q, setQ] = useState(''), [status, setStatus] = useState(''), [type, setType] = useState(''), [mode, setMode] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const list = useQuery({
    queryKey: ['invoices', dq, status, type, mode, from, to, page],
    queryFn: () => api('/pos/invoices', { query: { q: dq, status, type, taxMode: mode, from: from && `${from}T00:00:00+05:30`, to: to && `${to}T23:59:59+05:30`, page, limit: 20 } }),
    placeholderData: keepPreviousData,
  });
  const items: any[] = list.data?.items ?? [], pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  const reset = (f: () => void) => { f(); setPage(1); };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="font-display text-2xl">Bills</h1>
      <p className="mt-1 text-sm text-muted">{role === 'STAFF' ? 'The bills you made.' : 'Bills, credit notes and drafts.'}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Bill number" aria-label="Search by bill number" value={q} onChange={e => reset(() => setQ(e.target.value))} />
        <select aria-label="Status" className={`${inputCls} !w-auto`} value={status} onChange={e => reset(() => setStatus(e.target.value))}><option value="">Any status</option><option value="FINAL">Final</option><option value="DRAFT">Drafts</option><option value="CANCELLED">Cancelled</option></select>
        <select aria-label="Kind" className={`${inputCls} !w-auto`} value={type} onChange={e => reset(() => setType(e.target.value))}><option value="">Bills and credit notes</option><option value="SALE">Bills only</option><option value="CREDIT_NOTE">Credit notes only</option></select>
        {role !== 'STAFF' && <select aria-label="Bill type" className={`${inputCls} !w-auto`} value={mode} onChange={e => reset(() => setMode(e.target.value))}><option value="">GST and no-GST</option><option value="GST">GST invoices</option><option value="NON_GST">Bills of supply</option></select>}
        <label className="flex items-center gap-2 text-sm text-muted">From <input type="date" className={`${inputCls} !w-auto`} value={from} onChange={e => reset(() => setFrom(e.target.value))} /></label>
        <label className="flex items-center gap-2 text-sm text-muted">To <input type="date" className={`${inputCls} !w-auto`} value={to} onChange={e => reset(() => setTo(e.target.value))} /></label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Bill</th><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Customer</th><th className="p-3 font-medium">Branch</th><th className="p-3 text-right font-medium">Amount</th><th className="p-3 font-medium">Status</th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i._id} className="cursor-pointer border-b border-line last:border-0 hover:bg-gold-wash" onClick={() => nav(`/invoices/${i._id}`)}>
                <td className="p-3 font-medium">{i.number ?? 'Draft'}{i.taxMode === 'NON_GST' && <span className="ml-2 rounded bg-canvas px-1.5 text-xs text-muted">no GST</span>}</td>
                <td className="p-3 whitespace-nowrap text-muted">{dateTimeIST(i.finalizedAt ?? i.createdAt)}</td>
                <td className="p-3">{i.customer ? <>{i.customer.name}<span className="ml-2 text-xs text-muted">{i.customer.mobile}</span></> : <span className="text-muted">—</span>}</td>
                <td className="p-3 text-muted">{branches?.find(b => b._id === i.branchId)?.name ?? ''}</td>
                <td className="p-3 text-right"><Money paise={i.totals?.finalPayable} /></td>
                <td className={`p-3 ${statusColor(i)}`}>{statusText(i)}</td>
              </tr>))}
            {!list.isLoading && items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted">No bills found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted">
        <span>{list.data?.total ?? 0} bills</span>
        <span className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></span>
      </div>
    </div>
  );
}
