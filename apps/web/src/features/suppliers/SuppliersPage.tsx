import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateIST, formatINR, grams } from '@/lib/format';
import { useActiveBranch, useBranches, useDebounced } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Money } from '@/components/ui/Money';
import { NewPurchase, PurchaseDialog } from './PurchaseDialogs';
import { Owed } from './bits';

export function SuppliersPage() {
  const nav = useNavigate(), qc = useQueryClient(), { data: branches } = useBranches(), active = useActiveBranch();
  const [tab, setTab] = useState<'suppliers' | 'purchases'>('suppliers'), [q, setQ] = useState(''), [page, setPage] = useState(1), [adding, setAdding] = useState(false);
  const [status, setStatus] = useState(''), [branchId, setBranch] = useState(''), [creating, setCreating] = useState(false), [openId, setOpenId] = useState(''), dq = useDebounced(q);
  const sup = useQuery({ queryKey: ['suppliers', dq, page], queryFn: () => api('/suppliers', { query: { q: dq, page, limit: 20 } }), enabled: tab === 'suppliers', placeholderData: keepPreviousData });
  const pur = useQuery({ queryKey: ['purchases', dq, status, branchId, page], queryFn: () => api('/purchases', { query: { q: dq, status, branchId, page, limit: 20 } }), enabled: tab === 'purchases', placeholderData: keepPreviousData });
  const cur = tab === 'suppliers' ? sup.data : pur.data, items: any[] = cur?.items ?? [], pages = Math.max(1, Math.ceil((cur?.total ?? 0) / 20));
  const switchTab = (t: typeof tab) => { setTab(t); setPage(1); setQ(''); };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Suppliers & purchases</h1>
        <div className="flex gap-2"><Button onClick={() => setAdding(true)}>Add supplier</Button><Button variant="primary" onClick={() => setCreating(true)}>New purchase</Button></div>
      </div>
      <div role="tablist" className="mt-4 flex gap-1 border-b border-line">
        {([['suppliers', 'Suppliers'], ['purchases', 'Purchases']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => switchTab(k)} className={`px-4 py-2 text-sm ${tab === k ? 'border-b-2 border-gold font-medium text-gold-deep' : 'text-muted hover:text-ink'}`}>{l}</button>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder={tab === 'suppliers' ? 'Search name or mobile' : 'Purchase or bill number'} aria-label="Search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
        {tab === 'purchases' && <>
          <select aria-label="Branch" className={`${inputCls} !w-auto`} value={branchId} onChange={e => { setBranch(e.target.value); setPage(1); }}><option value="">All branches</option>{branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select>
          <select aria-label="Status" className={`${inputCls} !w-auto`} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Any status</option><option value="ACTIVE">Active</option><option value="CANCELLED">Cancelled</option></select></>}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper">
        {tab === 'suppliers' ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Supplier</th><th className="p-3 text-right font-medium">Cash</th><th className="p-3 text-right font-medium">Fine gold</th><th className="p-3 text-right font-medium">Fine silver</th></tr></thead>
            <tbody>{items.map(s => (
              <tr key={s._id} className="cursor-pointer border-b border-line last:border-0 hover:bg-gold-wash" onClick={() => nav(`/suppliers/${s._id}`)}>
                <td className="p-3"><div className="font-medium">{s.name}{s.active === false && <span className="ml-2 rounded bg-canvas px-1.5 text-xs text-muted">inactive</span>}</div><div className="text-xs text-muted">{s.mobile}</div></td>
                <td className="p-3 text-right"><Owed value={s.balancePaise} kind="cash" /></td><td className="p-3 text-right"><Owed value={s.goldFineMg} kind="metal" /></td><td className="p-3 text-right"><Owed value={s.silverFineMg} kind="metal" /></td></tr>))}
              {!sup.isLoading && items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted">No suppliers yet.</td></tr>}</tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Purchase</th><th className="p-3 font-medium">Supplier</th><th className="p-3 font-medium">Branch</th><th className="p-3 text-right font-medium">Cash</th><th className="p-3 text-right font-medium">Fine metal</th></tr></thead>
            <tbody>{items.map(p => (
              <tr key={p._id} className="cursor-pointer border-b border-line last:border-0 hover:bg-gold-wash" onClick={() => setOpenId(p._id)}>
                <td className="p-3"><div className="font-medium">{p.number}{p.status === 'CANCELLED' && <span className="ml-2 text-xs text-danger">cancelled</span>}</div><div className="text-xs text-muted">{p.billNo ? `Bill ${p.billNo} · ` : ''}{dateIST(p.billDate)}</div></td>
                <td className="p-3">{p.supplierName ?? '—'}</td><td className="p-3 text-muted">{branches?.find(b => b._id === p.branchId)?.name}</td>
                <td className="p-3 text-right"><Money paise={p.totalPaise} /></td>
                <td className="p-3 text-right num text-muted">{[p.fineGoldMg > 0 && `${grams(p.fineGoldMg)} gold`, p.fineSilverMg > 0 && `${grams(p.fineSilverMg)} silver`].filter(Boolean).join(' · ') || '—'}</td></tr>))}
              {!pur.isLoading && items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">No purchases yet.</td></tr>}</tbody>
          </table>)}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted"><span>{cur?.total ?? 0} {tab}</span>
        <span className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></span></div>

      {adding && <SupplierForm onClose={() => setAdding(false)} onSaved={s => { qc.invalidateQueries({ queryKey: ['suppliers'] }); nav(`/suppliers/${s._id}`); }} />}
      {creating && <NewPurchase defaultBranch={active?._id} onClose={() => setCreating(false)} onDone={p => { qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['suppliers'] }); setCreating(false); setTab('purchases'); setOpenId(p._id); }} />}
      {openId && <PurchaseDialog id={openId} onClose={() => setOpenId('')} onChanged={() => { qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['suppliers'] }); }} />}
    </div>
  );
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
export function SupplierForm({ supplier, onClose, onSaved }: { supplier?: any; onClose: () => void; onSaved: (s: any) => void }) {
  const role = useAuth(s => s.user!.role);
  const [name, setName] = useState(supplier?.name ?? ''), [mobile, setMobile] = useState(supplier?.mobile ?? ''), [address, setAddress] = useState(supplier?.address ?? '');
  const [gstin, setGstin] = useState(supplier?.gstin ?? ''), [remarks, setRemarks] = useState(supplier?.remarks ?? ''), [active, setActive] = useState(supplier?.active !== false);
  const bad = gstin !== '' && !GSTIN.test(gstin), badMobile = mobile !== '' && !/^[6-9]\d{9}$/.test(mobile);
  const save = useMutation({
    mutationFn: () => api(supplier ? `/suppliers/${supplier._id}` : '/suppliers', { method: supplier ? 'PATCH' : 'POST',
      body: { name: name.trim(), ...(mobile && { mobile }), ...(address && { address }), ...(gstin && { gstin }), ...(remarks && { remarks }), ...(supplier && { active }) } }),
    onSuccess: onSaved,
  });
  return (
    <Modal title={supplier ? 'Edit supplier' : 'Add supplier'} onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name"><Input autoFocus value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Mobile (optional)" error={badMobile ? 'Enter a 10-digit mobile number' : undefined}><Input inputMode="numeric" maxLength={10} value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Address (optional)"><Input value={address} onChange={e => setAddress(e.target.value)} /></Field>
        <Field label="GSTIN (optional)" error={bad ? 'That does not look like a valid GSTIN' : undefined}><Input value={gstin} maxLength={15} onChange={e => setGstin(e.target.value.toUpperCase())} /></Field>
        <Field label="Remarks"><Input value={remarks} onChange={e => setRemarks(e.target.value)} /></Field>
        {supplier && role !== 'STAFF' && <label className="flex gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Still buying from this supplier</label>}
        {save.error && <p className="text-sm text-danger" role="alert">{(save.error as Error).message}</p>}
        <Button type="submit" variant="primary" className="w-full" busy={save.isPending} disabled={name.trim().length < 2 || bad || badMobile}>Save</Button>
      </form>
    </Modal>);
}
