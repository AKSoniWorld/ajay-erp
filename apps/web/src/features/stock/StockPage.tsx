import { hasPermission } from '@ajay/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTimeIST } from '@/lib/format';
import { useActiveBranch, useBranches, useDebounced } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ProductPicker } from '@/features/products/ProductPicker';
import { gradeOf } from '@/features/products/ProductsPage';
import { TagDialog, TagItem } from '@/features/products/TagDialog';

const MOVE: Record<string, string> = { OPENING: 'Opening stock', PURCHASE: 'Purchase', SALE: 'Sale', TRANSFER_OUT: 'Sent to branch', TRANSFER_IN: 'Received from branch', ADJUST: 'Count correction', RETURN: 'Customer return' };

export function StockPage() {
  const role = useAuth(s => s.user!.role), { data: branches } = useBranches(), active = useActiveBranch(), canWrite = hasPermission(role, 'inventory.write');
  const [tab, setTab] = useState<'stock' | 'moves'>('stock'), [branchId, setBranch] = useState(''), bid = branchId || active?._id || '';
  const [q, setQ] = useState(''), [page, setPage] = useState(1), [mtype, setMtype] = useState(''), dq = useDebounced(q);
  const [adjust, setAdjust] = useState<any | null>(null), [opening, setOpening] = useState(false), [tags, setTags] = useState<TagItem[] | null>(null);
  const qc = useQueryClient();

  const stock = useQuery({ queryKey: ['stock', bid, dq, page], queryFn: () => api('/inventory', { query: { branchId: bid, q: dq, page, limit: 25 } }), enabled: tab === 'stock' && !!bid, placeholderData: keepPreviousData });
  const moves = useQuery({ queryKey: ['moves', bid, mtype, page], queryFn: () => api('/inventory/movements', { query: { branchId: bid, type: mtype, page, limit: 25 } }), enabled: tab === 'moves' && canWrite && !!bid, placeholderData: keepPreviousData });
  const cur = tab === 'stock' ? stock.data : moves.data, items: any[] = cur?.items ?? [], pages = Math.max(1, Math.ceil((cur?.total ?? 0) / 25));
  const done = () => { qc.invalidateQueries({ queryKey: ['stock'] }); qc.invalidateQueries({ queryKey: ['moves'] }); qc.invalidateQueries({ queryKey: ['products'] }); setAdjust(null); setOpening(false); };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Stock by branch</h1>
        <div className="flex gap-2">{canWrite && <Button onClick={() => setOpening(true)}>Add stock</Button>}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-muted">Branch<select className={`${inputCls} mt-1`} value={bid} onChange={e => { setBranch(e.target.value); setPage(1); }}>{branches?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></label>
        {tab === 'stock' && <Input className="max-w-xs" placeholder="Search name or SKU" aria-label="Search stock" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />}
        {tab === 'moves' && <label className="text-sm text-muted">Movement<select className={`${inputCls} mt-1`} value={mtype} onChange={e => { setMtype(e.target.value); setPage(1); }}><option value="">All</option>{Object.entries(MOVE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
      </div>
      {canWrite && (
        <div role="tablist" className="mt-4 flex gap-1 border-b border-line">
          {([['stock', 'In stock'], ['moves', 'Movements']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setPage(1); }} className={`px-4 py-2 text-sm ${tab === k ? 'border-b-2 border-gold font-medium text-gold-deep' : 'text-muted hover:text-ink'}`}>{l}</button>)}
        </div>)}

      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper">
        {tab === 'stock' ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Item</th><th className="p-3 font-medium">Grade</th><th className="p-3 text-right font-medium">In stock</th><th className="p-3" /></tr></thead>
            <tbody>{items.map(r => (
              <tr key={r._id} className="border-b border-line last:border-0">
                <td className="p-3"><div className="font-medium">{r.product.name}</div><div className="text-xs text-muted">{r.product.sku}</div></td>
                <td className="p-3">{gradeOf(r.product)}</td>
                <td className={`p-3 text-right num ${r.qty < 0 ? 'font-semibold text-danger' : r.qty === 0 ? 'text-muted' : ''}`}>{r.qty}{r.qty < 0 && <span className="ml-1 text-xs">(oversold — count it)</span>}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button variant="ghost" aria-label={`Print tag for ${r.product.name}`} onClick={() => setTags([{ productId: r.productId, name: r.product.name, sku: r.product.sku, copies: Math.max(r.qty, 1) }])}><Printer size={15} /></Button>
                  {canWrite && <Button variant="ghost" onClick={() => setAdjust(r)}>Correct count</Button>}</td></tr>))}
              {!stock.isLoading && items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted">No stock at this branch yet.</td></tr>}</tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Item</th><th className="p-3 font-medium">What happened</th><th className="p-3 text-right font-medium">Change</th></tr></thead>
            <tbody>{items.map(m => (
              <tr key={m._id} className="border-b border-line last:border-0">
                <td className="p-3 whitespace-nowrap text-muted">{dateTimeIST(m.at)}</td>
                <td className="p-3"><div className="font-medium">{m.product?.name ?? '—'}</div><div className="text-xs text-muted">{m.product?.sku}</div></td>
                <td className="p-3">{MOVE[m.type] ?? m.type}{m.note && <div className="text-xs text-muted">{m.note}</div>}</td>
                <td className={`p-3 text-right num ${m.qty < 0 ? 'text-danger' : 'text-ok'}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td></tr>))}
              {!moves.isLoading && items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted">Nothing yet.</td></tr>}</tbody>
          </table>)}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted"><span>{cur?.total ?? 0} {tab === 'stock' ? 'items' : 'movements'}</span>
        <span className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></span></div>

      {adjust && <AdjustDialog row={adjust} branchId={bid} onClose={() => setAdjust(null)} onDone={done} />}
      {opening && <OpeningDialog branchId={bid} branchName={branches?.find(b => b._id === bid)?.name ?? ''} onClose={() => setOpening(false)} onDone={done} />}
      {tags && <TagDialog initial={tags} onClose={() => setTags(null)} />}
    </div>
  );
}

/** Stock count correction: type what is actually on the shelf; the difference is recorded with the reason. */
function AdjustDialog({ row, branchId, onClose, onDone }: { row: any; branchId: string; onClose: () => void; onDone: () => void }) {
  const [counted, setCounted] = useState(String(row.qty)), [note, setNote] = useState('');
  const delta = Number(counted) - row.qty;
  const m = useMutation({ mutationFn: () => api('/inventory/adjust', { body: { productId: row.productId, branchId, qty: delta, type: 'ADJUST', note } }), onSuccess: onDone });
  return (
    <Modal title="Correct the count" onClose={onClose}>
      <div><div className="font-medium">{row.product.name}</div><div className="text-xs text-muted">{row.product.sku} · system says {row.qty}</div></div>
      <Field label="Actually on the shelf"><Input autoFocus inputMode="numeric" value={counted} onChange={e => setCounted(e.target.value.replace(/[^\d-]/g, ''))} /></Field>
      <Field label="Reason" hint="e.g. found damaged, counted again"><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
      {delta !== 0 && Number.isInteger(delta) && <p className="text-sm text-muted">Change: <b className={delta < 0 ? 'text-danger' : 'text-ok'}>{delta > 0 ? `+${delta}` : delta}</b></p>}
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={!Number.isInteger(delta) || delta === 0 || note.trim().length < 3 || counted === ''} onClick={() => m.mutate()}>Save correction</Button>
    </Modal>);
}

/** First stock of a product at a branch. */
function OpeningDialog({ branchId, branchName, onClose, onDone }: { branchId: string; branchName: string; onClose: () => void; onDone: () => void }) {
  const [product, setProduct] = useState<any | null>(null), [qty, setQty] = useState('');
  const m = useMutation({ mutationFn: () => api('/inventory/adjust', { body: { productId: product._id, branchId, qty: Number(qty), type: 'OPENING' } }), onSuccess: onDone });
  return (
    <Modal title={`Add stock at ${branchName}`} onClose={onClose}>
      {product ? <div className="flex items-center justify-between rounded border border-line p-2 text-sm"><span><b>{product.name}</b><span className="block text-xs text-muted">{product.sku}</span></span><button className="text-muted underline" onClick={() => setProduct(null)}>change</button></div>
        : <ProductPicker autoFocus branchId={branchId} onPick={setProduct} />}
      {product && <Field label="How many pieces?"><Input autoFocus inputMode="numeric" value={qty} onChange={e => setQty(e.target.value.replace(/\D/g, ''))} /></Field>}
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={!product || Number(qty) < 1} onClick={() => m.mutate()}>Add to stock</Button>
      <p className="text-xs text-muted">For goods bought from a supplier, record a purchase instead so the supplier’s account is updated.</p>
    </Modal>);
}
