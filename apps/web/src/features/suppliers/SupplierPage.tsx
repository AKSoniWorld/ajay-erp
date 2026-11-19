import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTimeIST, formatINR, grams, rupeesToPaise } from '@/lib/format';
import { useActiveBranch } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Money } from '@/components/ui/Money';
import { num } from '@/features/pos/types';
import { KIND, Owed, mgOf } from './bits';
import { SupplierForm } from './SuppliersPage';

type Acct = 'CASH' | 'GOLD' | 'SILVER';
type Dlg = null | 'pay' | 'metal' | 'convert' | 'adjust' | 'edit';
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${grams(Math.abs(n))}`;
const Tile = ({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) => (
  <div className="rounded-lg border border-line bg-paper p-4"><div className="text-sm text-muted">{label}</div><div className="mt-1 text-lg font-semibold">{children}</div>{sub && <div className="mt-1 text-xs text-muted">{sub}</div>}</div>);

export function SupplierPage() {
  const { id } = useParams(), role = useAuth(s => s.user!.role), qc = useQueryClient();
  const [acct, setAcct] = useState<Acct>('CASH'), [page, setPage] = useState(1), [dlg, setDlg] = useState<Dlg>(null);
  const prof = useQuery({ queryKey: ['supplier', id], queryFn: () => api<any>(`/suppliers/${id}`) });
  const led = useQuery({ queryKey: ['supplier-ledger', id, acct, page], queryFn: () => api<any>(`/suppliers/${id}/ledger`, { query: { account: acct, page, limit: 15 } }), placeholderData: keepPreviousData });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['supplier', id] }); qc.invalidateQueries({ queryKey: ['supplier-ledger', id] }); qc.invalidateQueries({ queryKey: ['suppliers'] }); setDlg(null); };
  const s = prof.data, items: any[] = led.data?.items ?? [], pages = Math.max(1, Math.ceil((led.data?.total ?? 0) / 15));
  if (prof.isError) return <div className="p-6 text-danger">{(prof.error as Error).message}</div>;
  if (!s) return <div className="p-6 text-sm text-muted">Opening…</div>;
  const v = s.valuedAtMarket, rates = s.marketRates;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link to="/suppliers" className="text-sm text-muted hover:underline">← Suppliers</Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="font-display text-2xl">{s.name}</h1><p className="text-sm text-muted">{[s.mobile, s.gstin, s.address].filter(Boolean).join(' · ')}</p>{s.remarks && <p className="text-sm text-muted">{s.remarks}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setDlg('pay')}>Pay cash</Button><Button onClick={() => setDlg('metal')}>Give metal</Button><Button onClick={() => setDlg('convert')}>Rate cut</Button>
          {role === 'ADMIN' && <Button onClick={() => setDlg('adjust')}>Correct cash</Button>}<Button variant="ghost" onClick={() => setDlg('edit')}>Edit</Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Cash"><Owed value={s.balances.balancePaise} kind="cash" /></Tile>
        <Tile label="Fine gold"><Owed value={s.balances.goldFineMg} kind="metal" /></Tile>
        <Tile label="Fine silver"><Owed value={s.balances.silverFineMg} kind="metal" /></Tile>
        <Tile label="Everything at today’s market rate" sub={rates.GOLD_24K || rates.SILVER ? `24K gold ${rates.GOLD_24K ? formatINR(rates.GOLD_24K, { decimals: false }) : '—'}/g · silver ${rates.SILVER ? formatINR(rates.SILVER, { decimals: false }) : '—'}/g` : 'Set the market rates to see this'}>
          {v ? <><Owed value={v.totalCashPaise} kind="cash" /><div className="text-xs font-normal text-muted">≈ {v.totalGoldFineMg !== null ? `${grams(Math.abs(v.totalGoldFineMg))} fine gold` : ''}</div></> : <span className="text-muted">—</span>}</Tile>
      </div>
      <p className="mt-2 text-sm text-muted">{s.purchases.count} purchases · {formatINR(s.purchases.totalPaise, { decimals: false })} bought in cash terms</p>

      <div role="tablist" className="mt-8 flex gap-1 border-b border-line">
        {([['CASH', 'Cash'], ['GOLD', 'Fine gold'], ['SILVER', 'Fine silver']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={acct === k} onClick={() => { setAcct(k); setPage(1); }} className={`px-4 py-2 text-sm ${acct === k ? 'border-b-2 border-gold font-medium text-gold-deep' : 'text-muted hover:text-ink'}`}>{l}</button>)}
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Entry</th><th className="p-3 font-medium">Reference</th><th className="p-3 text-right font-medium">Change <span className="font-normal">(+ we owe more)</span></th><th className="p-3 text-right font-medium">Balance</th></tr></thead>
          <tbody>{items.map(r => (
            <tr key={r._id} className="border-b border-line last:border-0 align-top">
              <td className="p-3 whitespace-nowrap text-muted">{dateTimeIST(r.at)}</td>
              <td className="p-3">{KIND[r.kind] ?? r.kind}{r.mode && <span className="ml-2 text-xs text-muted">{r.mode}</span>}
                {r.note && <div className="text-xs text-muted">{r.note}</div>}
                {r.rateGramPaise && <div className="text-xs text-muted">at {formatINR(r.rateGramPaise, { decimals: false })}/g{r.cashPaise ? ` · ${formatINR(r.cashPaise)}` : ''}</div>}</td>
              <td className="p-3 text-muted">{r.voucherNo ?? r.purchaseNo ?? ''}{r.billNo && <div className="text-xs">bill {r.billNo}</div>}</td>
              <td className="p-3 text-right">{acct === 'CASH' ? <Money paise={r.delta} /> : <span className="num">{signed(r.delta)}</span>}</td>
              <td className="p-3 text-right">{acct === 'CASH' ? <Money paise={r.balanceAfter} /> : <span className="num">{signed(r.balanceAfter)}</span>}</td></tr>))}
            {!led.isLoading && items.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">Nothing here yet.</td></tr>}</tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>

      {dlg === 'pay' && <PayDialog id={id!} rates={rates} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg === 'metal' && <MetalDialog id={id!} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg === 'convert' && <ConvertDialog id={id!} rates={rates} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg === 'adjust' && <AdjustDialog id={id!} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg === 'edit' && <SupplierForm supplier={s} onClose={() => setDlg(null)} onSaved={refresh} />}
    </div>
  );
}

type Rates = { GOLD_24K: number | null; SILVER: number | null };
const rateOf = (m: 'GOLD' | 'SILVER', r: Rates) => (m === 'GOLD' ? r.GOLD_24K : r.SILVER);

/** Cash paid to the supplier. It can settle cash owed — or fine gold/silver owed, worked out at today’s market rate. */
function PayDialog({ id, rates, onClose, onDone }: { id: string; rates: Rates; onClose: () => void; onDone: () => void }) {
  const branch = useActiveBranch(), [amount, setAmount] = useState(''), [mode, setMode] = useState('CASH'), [ref, setRef] = useState(''), [note, setNote] = useState(''), [settles, setSettles] = useState<Acct>('CASH');
  const paise = rupeesToPaise(num(amount)), rate = settles === 'CASH' ? null : rateOf(settles, rates), fine = rate ? Math.round((paise * 1000) / rate) : 0;
  const m = useMutation({ mutationFn: () => api<any>(`/suppliers/${id}/payments`, { body: { branchId: branch!._id, amountPaise: paise, mode, settles, ...(ref && { ref }), ...(note && { note }) } }) });
  if (m.data) return <Modal title="Payment saved" onClose={onDone}><p className="text-sm">Voucher <b>{m.data.voucherNo}</b>{m.data.fineMg ? ` — settles ${grams(m.data.fineMg)} fine at ${formatINR(m.data.rateGramPaise, { decimals: false })}/g` : ''}.</p><Button variant="primary" onClick={onDone}>Done</Button></Modal>;
  return (
    <Modal title="Pay the supplier" onClose={onClose}>
      <Field label="This payment settles"><select className={inputCls} value={settles} onChange={e => setSettles(e.target.value as Acct)}><option value="CASH">Cash we owe</option><option value="GOLD">Fine gold we owe (at today’s 24K market rate)</option><option value="SILVER">Fine silver we owe (at today’s market rate)</option></select></Field>
      <Field label="Amount (₹)"><Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      {settles !== 'CASH' && <p className="text-sm text-muted">{rate ? <>At {formatINR(rate, { decimals: false })}/g this clears <b>{grams(fine)}</b> of fine {settles === 'GOLD' ? 'gold' : 'silver'}.</> : <span className="text-danger">The market rate for this metal is not set yet. The admin sets it on the Rates page.</span>}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid by"><select className={inputCls} value={mode} onChange={e => setMode(e.target.value)}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK">Bank</option></select></Field>
        <Field label="Reference"><Input value={ref} onChange={e => setRef(e.target.value)} /></Field></div>
      <Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={!branch || paise <= 0 || (settles !== 'CASH' && !rate)} onClick={() => m.mutate()}>Save payment</Button>
    </Modal>);
}

/** Metal handed to the supplier — fine weight directly, or net weight × purity — optionally taken out of the branch’s old-metal stock. */
function MetalDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const branch = useActiveBranch(), [metal, setMetal] = useState<'GOLD' | 'SILVER'>('GOLD'), [by, setBy] = useState<'fine' | 'net'>('fine');
  const [fine, setFine] = useState(''), [net, setNet] = useState(''), [purity, setPurity] = useState('91.6'), [raw, setRaw] = useState(true), [ref, setRef] = useState('');
  const fineMg = by === 'fine' ? mgOf(fine) : Math.round((mgOf(net) * num(purity)) / 100);
  const m = useMutation({ mutationFn: () => api<any>(`/suppliers/${id}/metal-payments`, { body: { branchId: branch!._id, metal, ...(by === 'fine' ? { fineMg: mgOf(fine) } : { netMg: mgOf(net), purityPct: num(purity) }), fromRawInventory: raw, ...(ref && { ref }) } }) });
  if (m.data) return <Modal title="Metal given" onClose={onDone}><p className="text-sm">Voucher <b>{m.data.voucherNo}</b> — {grams(m.data.fineMg)} fine {metal === 'GOLD' ? 'gold' : 'silver'} credited.</p><Button variant="primary" onClick={onDone}>Done</Button></Modal>;
  return (
    <Modal title="Give metal to the supplier" onClose={onClose}>
      <Field label="Metal"><select className={inputCls} value={metal} onChange={e => { setMetal(e.target.value as 'GOLD' | 'SILVER'); setPurity(e.target.value === 'GOLD' ? '91.6' : '92.5'); }}><option value="GOLD">Gold</option><option value="SILVER">Silver</option></select></Field>
      <Field label="I know the…"><select className={inputCls} value={by} onChange={e => setBy(e.target.value as 'fine' | 'net')}><option value="fine">fine weight</option><option value="net">net weight and purity</option></select></Field>
      {by === 'fine' ? <Field label="Fine weight (g)"><Input autoFocus inputMode="decimal" value={fine} onChange={e => setFine(e.target.value)} /></Field>
        : <div className="grid grid-cols-2 gap-3"><Field label="Net weight (g)"><Input autoFocus inputMode="decimal" value={net} onChange={e => setNet(e.target.value)} /></Field><Field label="Purity %"><Input inputMode="decimal" value={purity} onChange={e => setPurity(e.target.value)} /></Field></div>}
      {fineMg > 0 && <p className="text-sm text-muted">Credits <b>{grams(fineMg)}</b> fine to the supplier.</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={raw} onChange={e => setRaw(e.target.checked)} /><span>Take it out of this branch’s old-metal stock<span className="block text-xs text-muted">Needs enough old metal on hand. Untick if the metal came from elsewhere.</span></span></label>
      <Field label="Reference"><Input value={ref} onChange={e => setRef(e.target.value)} /></Field>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={!branch || fineMg < 1} onClick={() => m.mutate()}>Save</Button>
    </Modal>);
}

/** “Rate cut”: turn cash we owe into fine weight, or fine weight back into cash, at today’s market rate. */
function ConvertDialog({ id, rates, onClose, onDone }: { id: string; rates: Rates; onClose: () => void; onDone: () => void }) {
  const [dir, setDir] = useState<'CASH_TO_FINE' | 'FINE_TO_CASH'>('CASH_TO_FINE'), [metal, setMetal] = useState<'GOLD' | 'SILVER'>('GOLD'), [value, setValue] = useState('');
  const rate = rateOf(metal, rates), paise = rupeesToPaise(num(value)), fineMg = mgOf(value);
  const preview = rate ? (dir === 'CASH_TO_FINE' ? `≈ ${grams(Math.round((paise * 1000) / rate))} fine` : `≈ ${formatINR(Math.round((fineMg * rate) / 1000))}`) : '';
  const m = useMutation({ mutationFn: () => api<any>(`/suppliers/${id}/convert`, { body: { direction: dir, metal, ...(dir === 'CASH_TO_FINE' ? { amountPaise: paise } : { fineMg }) } }), onSuccess: onDone });
  return (
    <Modal title="Rate cut" onClose={onClose}>
      <p className="text-sm text-muted">Fix today’s market rate on part of the account: cash owed becomes fine weight owed, or the other way round.</p>
      <Field label="Change"><select className={inputCls} value={dir} onChange={e => { setDir(e.target.value as any); setValue(''); }}><option value="CASH_TO_FINE">Cash owed → fine weight owed</option><option value="FINE_TO_CASH">Fine weight owed → cash owed</option></select></Field>
      <Field label="Metal"><select className={inputCls} value={metal} onChange={e => setMetal(e.target.value as any)}><option value="GOLD">Gold (24K market rate)</option><option value="SILVER">Silver</option></select></Field>
      <Field label={dir === 'CASH_TO_FINE' ? 'Cash to convert (₹)' : 'Fine weight to convert (g)'}><Input autoFocus inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /></Field>
      <p className="text-sm text-muted">{rate ? <>Rate {formatINR(rate, { decimals: false })}/g {preview && <b className="ml-2 text-ink">{preview}</b>}</> : <span className="text-danger">The market rate is not set yet (Rates page).</span>}</p>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={!rate || (dir === 'CASH_TO_FINE' ? paise <= 0 : fineMg <= 0)} onClick={() => m.mutate()}>Convert</Button>
    </Modal>);
}

function AdjustDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState('INCREASE'), [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const m = useMutation({ mutationFn: () => api(`/suppliers/${id}/adjustments`, { body: { type, amountPaise: rupeesToPaise(num(amount)), reason } }), onSuccess: onDone });
  return (
    <Modal title="Correct the cash balance" onClose={onClose}>
      <Field label="Change"><select className={inputCls} value={type} onChange={e => setType(e.target.value)}><option value="INCREASE">We owe more</option><option value="DECREASE">We owe less</option></select></Field>
      <Field label="Amount (₹)"><Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <Field label="Reason"><Input value={reason} onChange={e => setReason(e.target.value)} /></Field>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={num(amount) <= 0 || reason.trim().length < 3} onClick={() => m.mutate()}>Save correction</Button>
    </Modal>);
}
