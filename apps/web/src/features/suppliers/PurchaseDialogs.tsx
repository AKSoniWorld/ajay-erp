import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateIST, formatINR, grams, rupeesToPaise, todayIST } from '@/lib/format';
import { useBranches } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Money } from '@/components/ui/Money';
import { num } from '@/features/pos/types';
import { ProductPicker } from '@/features/products/ProductPicker';

interface Line { key: number; p?: any; description: string; qty: string; cost: string; fine: boolean }
const fineOf = (p: any, qty: number) => Math.round((p.netMg * p.purityPct) / 100) * qty;
const MODES = [['CASH', 'Cash'], ['UPI', 'UPI'], ['CARD', 'Card'], ['BANK', 'Bank']];

/** Record goods bought from a supplier: adds to stock, and puts the cash part — and any gold/silver settled in fine weight — on the supplier's account. */
export function NewPurchase({ defaultBranch, onClose, onDone }: { defaultBranch?: string; onClose: () => void; onDone: (p: any) => void }) {
  const user = useAuth(s => s.user!), { data: branches } = useBranches();
  const mine = branches?.filter(b => user.role === 'ADMIN' || user.branchIds.includes(b._id)) ?? [];
  const suppliers = useQuery({ queryKey: ['suppliers-pick'], queryFn: () => api<{ items: any[] }>('/suppliers', { query: { limit: 100 } }) });
  const [supplierId, setSupplier] = useState(''), [branchId, setBranch] = useState(defaultBranch ?? ''), [billNo, setBillNo] = useState(''), [billDate, setBillDate] = useState(todayIST());
  const [lines, setLines] = useState<Line[]>([]), [gst, setGst] = useState(''), [payAmt, setPayAmt] = useState(''), [payMode, setPayMode] = useState('CASH'), [payRef, setPayRef] = useState(''), [remarks, setRemarks] = useState('');
  const bid = branchId || mine[0]?._id || '';
  const upd = (key: number, patch: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const addProduct = (p: any) => setLines(ls => (ls.some(l => l.p?._id === p._id) ? ls : [...ls, { key: Date.now(), p, description: '', qty: '1', cost: '', fine: false }]));
  const addOther = () => setLines(ls => [...ls, { key: Date.now(), description: '', qty: '1', cost: '', fine: false }]);

  const lineCash = (l: Line) => Math.max(0, Math.round(num(l.qty))) * rupeesToPaise(num(l.cost));
  const subtotal = lines.reduce((s, l) => s + lineCash(l), 0), gstP = rupeesToPaise(num(gst)), total = subtotal + gstP, paid = rupeesToPaise(num(payAmt));
  const fineGold = lines.filter(l => l.fine && l.p?.metal === 'GOLD').reduce((s, l) => s + fineOf(l.p, Math.round(num(l.qty))), 0);
  const fineSilver = lines.filter(l => l.fine && l.p?.metal === 'SILVER').reduce((s, l) => s + fineOf(l.p, Math.round(num(l.qty))), 0);
  const valid = !!supplierId && !!bid && lines.length > 0 && paid <= total && lines.every(l => Math.round(num(l.qty)) >= 1 && l.cost !== '' && (l.p || l.description.trim().length > 0));

  const save = useMutation({
    mutationFn: () => api('/purchases', { body: {
      supplierId, branchId: bid, ...(billNo && { billNo }), billDate: `${billDate}T00:00:00+05:30`,
      items: lines.map(l => ({ ...(l.p ? { productId: l.p._id } : { description: l.description.trim() }), qty: Math.round(num(l.qty)), unitCostPaise: rupeesToPaise(num(l.cost)), ...(l.fine && { settleInFine: true }) })),
      ...(gstP > 0 && { gstPaise: gstP }), ...(paid > 0 && { payment: { amountPaise: paid, mode: payMode, ...(payRef && { ref: payRef }) } }), ...(remarks && { remarks }) } }),
    onSuccess: onDone,
  });

  return (
    <Modal title="New purchase" onClose={onClose}>
      <Field label="Supplier"><select className={inputCls} value={supplierId} onChange={e => setSupplier(e.target.value)}><option value="">Choose…</option>{suppliers.data?.items.filter(s => s.active !== false).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stock goes to"><select className={inputCls} value={bid} onChange={e => { setBranch(e.target.value); }}>{mine.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select></Field>
        <Field label="Bill date"><input type="date" className={inputCls} value={billDate} max={todayIST()} onChange={e => setBillDate(e.target.value)} /></Field>
      </div>
      <Field label="Supplier’s bill number (optional)"><Input value={billNo} onChange={e => setBillNo(e.target.value)} /></Field>

      <div><div className="mb-1 text-sm font-medium">Items</div><ProductPicker branchId={bid} onPick={addProduct} />
        <button type="button" className="mt-2 text-sm text-gold-deep underline" onClick={addOther}>+ Add a charge that is not a stock item (packing, freight…)</button></div>
      <ul className="space-y-3">{lines.map(l => {
        const metal = l.p?.metal === 'GOLD' || l.p?.metal === 'SILVER';
        return (
          <li key={l.key} className="rounded border border-line p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              {l.p ? <div><div className="font-medium">{l.p.name}</div><div className="text-xs text-muted">{l.p.sku}</div></div>
                : <Input aria-label="Description" placeholder="What is this charge?" value={l.description} onChange={e => upd(l.key, { description: e.target.value })} />}
              <button aria-label="Remove line" className="text-muted hover:text-danger" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>✕</button></div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label="Pieces"><Input inputMode="numeric" value={l.qty} onChange={e => upd(l.key, { qty: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label={l.fine ? 'Making / labour per piece (₹)' : 'Cost per piece (₹)'}><Input inputMode="decimal" value={l.cost} onChange={e => upd(l.key, { cost: e.target.value })} /></Field>
            </div>
            {metal && <label className="mt-2 flex items-start gap-2"><input type="checkbox" className="mt-1" checked={l.fine} onChange={e => upd(l.key, { fine: e.target.checked })} />
              <span>Pay for the metal in fine weight{l.fine && <span className="block text-xs text-muted">We owe {grams(fineOf(l.p, Math.round(num(l.qty))))} fine {l.p.metal === 'GOLD' ? 'gold' : 'silver'}; the amount above is only the making/labour in cash.</span>}</span></label>}
          </li>);
      })}</ul>

      <Field label="GST on the supplier’s bill (₹, optional)"><Input inputMode="decimal" value={gst} onChange={e => setGst(e.target.value)} /></Field>
      <div className="rounded border border-line bg-canvas p-3 text-sm">
        <div className="flex justify-between"><span className="text-muted">Cash to pay</span><b>{formatINR(total)}</b></div>
        {fineGold > 0 && <div className="flex justify-between"><span className="text-muted">Fine gold owed</span><b>{grams(fineGold)}</b></div>}
        {fineSilver > 0 && <div className="flex justify-between"><span className="text-muted">Fine silver owed</span><b>{grams(fineSilver)}</b></div>}
      </div>
      <fieldset className="space-y-2 rounded border border-line p-3 text-sm"><legend className="px-1 font-medium">Paid now (optional)</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)" error={paid > total ? 'More than the cash part' : undefined}><Input inputMode="decimal" value={payAmt} onChange={e => setPayAmt(e.target.value)} /></Field>
          <Field label="Paid by"><select className={inputCls} value={payMode} onChange={e => setPayMode(e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div>
        {paid > 0 && <Field label="Reference"><Input value={payRef} onChange={e => setPayRef(e.target.value)} /></Field>}
      </fieldset>
      <Field label="Remarks"><Input value={remarks} onChange={e => setRemarks(e.target.value)} /></Field>
      {save.error && <p className="text-sm text-danger" role="alert">{(save.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={save.isPending} disabled={!valid} onClick={() => save.mutate()}>Save purchase and add to stock</Button>
    </Modal>);
}

export function PurchaseDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const role = useAuth(s => s.user!.role), { data: branches } = useBranches();
  const q = useQuery({ queryKey: ['purchase', id], queryFn: () => api<any>(`/purchases/${id}`) });
  const [asking, setAsking] = useState(false), [reason, setReason] = useState('');
  const cancel = useMutation({ mutationFn: () => api(`/purchases/${id}/cancel`, { body: { reason } }), onSuccess: () => { q.refetch(); onChanged(); setAsking(false); } });
  const p = q.data;
  if (!p) return <Modal title="Purchase" onClose={onClose}><p className="text-sm text-muted">{q.isError ? (q.error as Error).message : 'Opening…'}</p></Modal>;
  return (
    <Modal title={p.number} onClose={onClose}>
      <p className="text-sm text-muted">{branches?.find(b => b._id === p.branchId)?.name} · {p.billNo ? `bill ${p.billNo} · ` : ''}{dateIST(p.billDate)}{p.status === 'CANCELLED' && <span className="ml-2 text-danger">cancelled — {p.cancelReason}</span>}</p>
      <table className="w-full text-sm"><tbody>{p.items.map((i: any, n: number) => (
        <tr key={n} className="border-b border-line align-top"><td className="py-1.5"><div className="font-medium">{i.description}</div><div className="text-xs text-muted">{i.sku ? `${i.sku} · ` : ''}{i.qty} × {formatINR(i.unitCostPaise)}{i.settleInFine ? ` · ${grams(i.fineMg)} fine ${i.metal === 'GOLD' ? 'gold' : 'silver'}` : ''}</div></td><td className="py-1.5 text-right"><Money paise={i.amountPaise} /></td></tr>))}</tbody></table>
      <dl className="space-y-1 text-sm">
        {p.gstPaise > 0 && <div className="flex justify-between"><dt className="text-muted">GST</dt><dd><Money paise={p.gstPaise} /></dd></div>}
        <div className="flex justify-between font-semibold"><dt>Cash total</dt><dd><Money paise={p.totalPaise} strong /></dd></div>
        {p.paidPaise > 0 && <div className="flex justify-between"><dt className="text-muted">Paid at the time</dt><dd><Money paise={p.paidPaise} /></dd></div>}
        {p.fineGoldMg > 0 && <div className="flex justify-between"><dt className="text-muted">Fine gold owed</dt><dd className="num">{grams(p.fineGoldMg)}</dd></div>}
        {p.fineSilverMg > 0 && <div className="flex justify-between"><dt className="text-muted">Fine silver owed</dt><dd className="num">{grams(p.fineSilverMg)}</dd></div>}
      </dl>
      {p.remarks && <p className="text-sm text-muted">{p.remarks}</p>}
      {cancel.error && <p className="text-sm text-danger" role="alert">{(cancel.error as Error).message}</p>}
      {role === 'ADMIN' && p.status === 'ACTIVE' && (asking
        ? <div className="space-y-2"><Input autoFocus placeholder="Reason for cancelling" value={reason} onChange={e => setReason(e.target.value)} />
            <p className="text-xs text-muted">The stock added by this purchase is taken back and the supplier’s account is reversed. Not possible if the stock has already been sold.</p>
            <div className="flex gap-2"><Button variant="danger" busy={cancel.isPending} disabled={reason.trim().length < 3} onClick={() => cancel.mutate()}>Cancel purchase</Button><Button onClick={() => setAsking(false)}>Back</Button></div></div>
        : <Button variant="ghost" onClick={() => setAsking(true)}>Cancel this purchase</Button>)}
    </Modal>);
}
