import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { addDaysIST, lastMonthIST, monthStartIST, todayIST } from '@/lib/format';
import { downloadFile } from '@/lib/files';
import { useBranches } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { inputCls } from '@/components/ui/Field';
import { CustomerPicker } from '@/features/pos/CustomerPicker';
import { CustomerLite } from '@/features/pos/types';
import { HeadOffice } from './HeadOffice';
import { Report, ReportTable } from './ReportTable';

type Who = 'ALL' | 'ADMIN_OWNER' | 'ADMIN';
interface Def { key: string; label: string; path?: string; who: Who; needs?: 'customer' | 'supplier'; filters?: string[] }
const DEFS: Def[] = [
  { key: 'overview', label: 'Business overview', who: 'ADMIN' },
  { key: 'sales', label: 'Sales', path: 'sales', who: 'ALL', filters: ['granularity', 'taxMode'] },
  { key: 'branches', label: 'Branch comparison', path: 'branch-comparison', who: 'ADMIN' },
  { key: 'old-gold', label: 'Old gold', path: 'old-gold', who: 'ADMIN_OWNER' },
  { key: 'old-silver', label: 'Old silver', path: 'old-silver', who: 'ADMIN_OWNER' },
  { key: 'dairy', label: 'Dairy collection', path: 'dairy-collection', who: 'ADMIN_OWNER' },
  { key: 'stock', label: 'Stock movement', path: 'stock-movement', who: 'ADMIN_OWNER', filters: ['type'] },
  { key: 'customer', label: 'Customer ledger', path: 'customer-ledger', who: 'ADMIN_OWNER', needs: 'customer' },
  { key: 'supplier', label: 'Supplier ledger', path: 'supplier-ledger', who: 'ADMIN_OWNER', needs: 'supplier', filters: ['account'] },
];
const allowed = (d: Def, role: string) => d.who === 'ALL' || (d.who === 'ADMIN_OWNER' && role !== 'STAFF') || (d.who === 'ADMIN' && role === 'ADMIN');
const STOCK_TYPES = ['OPENING', 'PURCHASE', 'SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUST', 'RETURN'];

export function ReportsPage() {
  const role = useAuth(s => s.user!.role), { data: branches } = useBranches();
  const defs = DEFS.filter(d => allowed(d, role)), [key, setKey] = useState(defs[0].key), def = defs.find(d => d.key === key)!;
  const [from, setFrom] = useState(monthStartIST()), [to, setTo] = useState(todayIST()), [branchId, setBranch] = useState('');
  const [granularity, setGran] = useState('day'), [taxMode, setTax] = useState(''), [type, setType] = useState(''), [account, setAccount] = useState('');
  const [customer, setCustomer] = useState<CustomerLite | null>(null), [supplierId, setSupplier] = useState('');
  const [busy, setBusy] = useState(''), [dlErr, setDlErr] = useState('');
  const suppliers = useQuery({ queryKey: ['suppliers-pick'], queryFn: () => api<{ items: any[] }>('/suppliers', { query: { limit: 100 } }), enabled: def.needs === 'supplier' });

  const params: Record<string, string> = { from, to, ...(branchId && { branchId }), ...(def.filters?.includes('granularity') && { granularity }), ...(def.filters?.includes('taxMode') && taxMode && { taxMode }),
    ...(def.filters?.includes('type') && type && { type }), ...(def.filters?.includes('account') && account && { account }), ...(customer && def.needs === 'customer' && { customerId: customer._id }), ...(supplierId && def.needs === 'supplier' && { supplierId }) };
  const ready = !def.needs || (def.needs === 'customer' ? !!customer : !!supplierId);
  const report = useQuery({ queryKey: ['report', def.key, params], queryFn: () => api<Report>(`/reports/${def.path}`, { query: params }), enabled: !!def.path && ready });

  const download = async (format: 'csv' | 'pdf') => {
    setBusy(format); setDlErr('');
    try { await downloadFile(`/reports/${def.path}?${new URLSearchParams({ ...params, format })}`, `${def.path}-${from}_${to}.${format}`); }
    catch (e) { setDlErr((e as Error).message); } finally { setBusy(''); }
  };
  const preset = (f: string, t: string) => { setFrom(f); setTo(t); };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="font-display text-2xl">Reports</h1>
      <div role="tablist" className="mt-4 flex flex-wrap gap-1 border-b border-line">
        {defs.map(d => <button key={d.key} role="tab" aria-selected={key === d.key} onClick={() => setKey(d.key)} className={`px-3 py-2 text-sm ${key === d.key ? 'border-b-2 border-gold font-medium text-gold-deep' : 'text-muted hover:text-ink'}`}>{d.label}</button>)}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-muted">From<input type="date" className={`${inputCls} mt-1`} value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
        <label className="text-sm text-muted">To<input type="date" className={`${inputCls} mt-1`} value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
        <div className="flex gap-1 text-sm">
          <Button variant="ghost" onClick={() => preset(todayIST(), todayIST())}>Today</Button>
          <Button variant="ghost" onClick={() => preset(addDaysIST(todayIST(), -6), todayIST())}>Last 7 days</Button>
          <Button variant="ghost" onClick={() => preset(monthStartIST(), todayIST())}>This month</Button>
          <Button variant="ghost" onClick={() => { const m = lastMonthIST(); preset(m.from, m.to); }}>Last month</Button>
        </div>
        {def.key !== 'overview' && branches && branches.length > 1 && (
          <label className="text-sm text-muted">Branch<select className={`${inputCls} mt-1`} value={branchId} onChange={e => setBranch(e.target.value)}><option value="">{role === 'ADMIN' ? 'All branches' : 'All my branches'}</option>{branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></label>)}
        {def.filters?.includes('granularity') && <label className="text-sm text-muted">Group by<select className={`${inputCls} mt-1`} value={granularity} onChange={e => setGran(e.target.value)}><option value="day">Day</option><option value="month">Month</option></select></label>}
        {def.filters?.includes('taxMode') && role !== 'STAFF' && <label className="text-sm text-muted">Bill type<select className={`${inputCls} mt-1`} value={taxMode} onChange={e => setTax(e.target.value)}><option value="">GST and no-GST</option><option value="GST">GST invoices</option><option value="NON_GST">Bills of supply</option></select></label>}
        {def.filters?.includes('type') && <label className="text-sm text-muted">Movement<select className={`${inputCls} mt-1`} value={type} onChange={e => setType(e.target.value)}><option value="">All</option>{STOCK_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').toLowerCase()}</option>)}</select></label>}
        {def.filters?.includes('account') && <label className="text-sm text-muted">Account<select className={`${inputCls} mt-1`} value={account} onChange={e => setAccount(e.target.value)}><option value="">Cash and metal</option><option value="CASH">Cash</option><option value="GOLD">Fine gold</option><option value="SILVER">Fine silver</option></select></label>}
        {def.needs === 'supplier' && <label className="text-sm text-muted">Supplier<select className={`${inputCls} mt-1`} value={supplierId} onChange={e => setSupplier(e.target.value)}><option value="">Choose…</option>{suppliers.data?.items.map((s: any) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>}
        {def.path && <div className="ml-auto flex gap-2"><Button onClick={() => download('csv')} busy={busy === 'csv'} disabled={!ready}>Download CSV</Button><Button onClick={() => download('pdf')} busy={busy === 'pdf'} disabled={!ready}>Download PDF</Button></div>}
      </div>
      {def.needs === 'customer' && <div className="mt-3 max-w-sm"><CustomerPicker value={customer} onChange={setCustomer} /></div>}
      {dlErr && <p className="mt-2 text-sm text-danger" role="alert">{dlErr}</p>}

      <div className="mt-5">
        {def.key === 'overview' ? <HeadOffice from={from} to={to} />
          : !ready ? <p className="text-sm text-muted">Choose a {def.needs} to see this report.</p>
          : report.isLoading ? <p className="text-sm text-muted">Working it out…</p>
          : report.isError ? <p className="text-sm text-danger" role="alert">{(report.error as Error).message}</p>
          : report.data && <><h2 className="mb-2 font-medium">{report.data.title}</h2><ReportTable r={report.data} /></>}
      </div>
    </div>
  );
}
