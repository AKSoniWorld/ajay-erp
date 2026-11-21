import { hasPermission } from '@ajay/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openPdf } from '@/lib/files';
import { dateTimeIST, formatINR, grams } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { AdjustDialog, ReceiveDialog, RefundDialog } from './AccountDialogs';
import { CustomerForm } from './CustomersPage';

type Tab = 'ADVANCE' | 'DUE' | 'DAIRY' | 'PURCHASES' | 'EXCHANGES';
const KIND: Record<string, string> = {
  ADVANCE_RECEIPT: 'Advance received', ADVANCE_USED: 'Used on a bill', ADVANCE_REFUND: 'Refunded', DUE_CREATED: 'Sold on credit', DUE_PAYMENT: 'Payment received', MANUAL: 'Correction',
  PAYMENT: 'Instalment', BONUS: 'Bonus', INVOICE: 'Used on a bill',
};

const Tile = ({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) => (
  <div className="rounded-lg border border-line bg-paper p-4"><div className="text-sm text-muted">{label}</div><div className="mt-1 text-2xl font-semibold">{children}</div>{sub && <div className="mt-1 text-xs text-muted">{sub}</div>}</div>);

export function CustomerPage() {
  const { id } = useParams(), role = useAuth(s => s.user!.role), qc = useQueryClient();
  const internal = role !== 'STAFF', canVoid = hasPermission(role, 'invoice.void'), isAdmin = role === 'ADMIN';
  const [tab, setTab] = useState<Tab>('ADVANCE'), [page, setPage] = useState(1), [dlg, setDlg] = useState<null | 'advance' | 'due' | 'refund' | 'adjust' | 'edit'>(null);
  const customer = useQuery({ queryKey: ['customer', id], queryFn: () => api(`/customers/${id}`) });
  const account = useQuery({ queryKey: ['cust-account-page', id], queryFn: () => api(`/customers/${id}/account`) });
  const stmt = useQuery({ queryKey: ['statement', id, tab, page], queryFn: () => api(`/customers/${id}/statement`, { query: { account: tab, page, limit: 15 } }), placeholderData: keepPreviousData });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['customer', id] }); qc.invalidateQueries({ queryKey: ['cust-account-page', id] }); qc.invalidateQueries({ queryKey: ['statement', id] }); setDlg(null); };
  const c = customer.data, a = account.data, items: any[] = stmt.data?.items ?? [], pages = Math.max(1, Math.ceil((stmt.data?.total ?? 0) / 15));
  if (customer.isError) return <div className="p-6 text-danger">{(customer.error as Error).message}</div>;
  const tabs: [Tab, string][] = [['ADVANCE', 'Advance'], ['DUE', 'Due'], ['DAIRY', 'Dairy'], ['PURCHASES', 'Purchases'], ...(internal ? [['EXCHANGES', 'Old metal'] as [Tab, string]] : [])];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link to="/customers" className="text-sm text-muted hover:underline">← Customers</Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="font-display text-2xl">{c?.name ?? '…'}</h1><p className="text-sm text-muted">{c?.mobile}{c?.address ? ` · ${c.address}` : ''}</p>{c?.remarks && <p className="text-sm text-muted">{c.remarks}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDlg('advance')}>Receive advance</Button>
          {(a?.due.balancePaise ?? 0) > 0 && <Button variant="primary" onClick={() => setDlg('due')}>Collect dues</Button>}
          {canVoid && (a?.advance.balancePaise ?? 0) > 0 && <Button onClick={() => setDlg('refund')}>Refund advance</Button>}
          {isAdmin && <Button onClick={() => setDlg('adjust')}>Correct a balance</Button>}
          <Button variant="ghost" onClick={() => setDlg('edit')}>Edit</Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Jama (Advance)"><Money paise={a?.advance.balancePaise ?? 0} /></Tile>
        <Tile label="Baaki (Due)"><span className={(a?.due.balancePaise ?? 0) > 0 ? 'text-warn' : ''}><Money paise={a?.due.balancePaise ?? 0} /></span></Tile>
        <Tile label="Dairy savings" sub={a?.dairy.schemes.length ? a.dairy.schemes.map((s: any) => <Link key={s.schemeId} to={`/dairy/${s.schemeId}`} className="mr-2 underline">{s.schemeNo}</Link>) : 'No scheme'}><Money paise={a?.dairy.balancePaise ?? 0} /></Tile>
        <Tile label="Total purchases" sub={`${a?.purchases.invoiceCount ?? 0} bills · returns ${formatINR(a?.purchases.returnsPaise ?? 0, { decimals: false })}`}><Money paise={a?.purchases.totalPaise ?? 0} decimals={false} /></Tile>
      </div>

      <div role="tablist" className="mt-8 flex gap-1 border-b border-line">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setPage(1); }} className={`px-4 py-2 text-sm ${tab === k ? 'border-b-2 border-gold font-medium text-gold-deep' : 'text-muted hover:text-ink'}`}>{label}</button>)}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted">
            <th className="p-3 font-medium">When</th>
            {tab === 'PURCHASES' ? <><th className="p-3 font-medium">Bill</th><th className="p-3 text-right font-medium">Amount</th><th className="p-3 text-right font-medium">Advance used</th><th className="p-3 text-right font-medium">Left due</th></>
              : tab === 'EXCHANGES' ? <><th className="p-3 font-medium">Bill</th><th className="p-3 text-right font-medium">Fine gold</th><th className="p-3 text-right font-medium">Fine silver</th><th className="p-3 text-right font-medium">Value</th></>
              : <><th className="p-3 font-medium">Entry</th><th className="p-3 font-medium">Reference</th><th className="p-3 text-right font-medium">Amount</th><th className="p-3 text-right font-medium">Balance</th><th className="p-3" /></>}
          </tr></thead>
          <tbody>{items.map((r, n) => tab === 'PURCHASES' ? (
            <tr key={r._id} className="border-b border-line last:border-0"><td className="p-3 text-muted whitespace-nowrap">{dateTimeIST(r.finalizedAt)}</td>
              <td className="p-3"><Link to={`/invoices/${r._id}`} className="underline">{r.number}</Link>{r.type === 'CREDIT_NOTE' && <span className="ml-2 text-xs text-danger">credit note</span>}</td>
              <td className="p-3 text-right"><Money paise={r.totals.finalPayable} /></td><td className="p-3 text-right"><Money paise={r.advancePaise ?? 0} /></td><td className="p-3 text-right"><Money paise={r.duePaise ?? 0} /></td></tr>
          ) : tab === 'EXCHANGES' ? (
            <tr key={r._id} className="border-b border-line last:border-0"><td className="p-3 text-muted whitespace-nowrap">{dateTimeIST(r.at)}</td><td className="p-3">{r.invoiceNumber}</td>
              <td className="p-3 text-right num">{grams(r.totals?.goldFineMg ?? 0)}</td><td className="p-3 text-right num">{grams(r.totals?.silverFineMg ?? 0)}</td>
              <td className="p-3 text-right"><Money paise={(r.totals?.goldValuePaise ?? 0) + (r.totals?.silverValuePaise ?? 0)} /></td></tr>
          ) : (
            <tr key={r._id ?? n} className="border-b border-line last:border-0"><td className="p-3 text-muted whitespace-nowrap">{dateTimeIST(r.at)}</td>
              <td className="p-3">{KIND[r.kind] ?? r.kind}{r.schemeNo && <span className="ml-2 text-xs text-muted">{r.schemeNo}</span>}{r.note && <div className="text-xs text-muted">{r.note}</div>}</td>
              <td className="p-3 text-muted">{r.receiptNo ?? r.invoiceNumber ?? ''}</td>
              <td className="p-3 text-right"><Money paise={r.delta ?? (r.direction === 'DEBIT' ? -r.amountPaise : r.amountPaise)} /></td>
              <td className="p-3 text-right"><Money paise={r.balanceAfter} /></td>
              <td className="p-3 text-right">{r.receiptNo && <Button variant="ghost" onClick={() => openPdf(`/customers/${id}/receipts/${r.receiptNo}/pdf`)}>Receipt</Button>}</td></tr>))}
            {!stmt.isLoading && items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted">Nothing here yet.</td></tr>}</tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>

      {dlg === 'advance' && <ReceiveDialog customerId={id!} kind="advance" onClose={() => setDlg(null)} onDone={() => { qc.invalidateQueries({ queryKey: ['cust-account-page', id] }); qc.invalidateQueries({ queryKey: ['statement', id] }); }} />}
      {dlg === 'due' && <ReceiveDialog customerId={id!} kind="dues/payments" due={a?.due.balancePaise} onClose={() => setDlg(null)} onDone={() => { qc.invalidateQueries({ queryKey: ['cust-account-page', id] }); qc.invalidateQueries({ queryKey: ['statement', id] }); }} />}
      {dlg === 'refund' && <RefundDialog customerId={id!} balance={a?.advance.balancePaise ?? 0} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg === 'adjust' && <AdjustDialog customerId={id!} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg === 'edit' && c && <CustomerForm customer={c} onClose={() => setDlg(null)} onSaved={refresh} />}
    </div>
  );
}
