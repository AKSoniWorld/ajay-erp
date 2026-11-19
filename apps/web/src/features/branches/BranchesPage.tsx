import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { INDIAN_STATES } from '@/lib/states';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const blank = { code: '', prefix: '', name: '', address: '', state: 'Jharkhand', registered: true, gstin: '', whatsapp: '', exchangeDisplay: 'AMOUNT', invoicePaper: 'A4', receiptPaper: 'A5', tagSize: '40x25', connection: 'usb', language: 'ESCPOS', device: '', active: true };
type F = typeof blank;

export function BranchesPage() {
  const qc = useQueryClient(), [editing, setEditing] = useState<any | 'new' | null>(null);
  const list = useQuery({ queryKey: ['branches'], queryFn: () => api<any[]>('/branches') });
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-3"><h1 className="font-display text-2xl">Branches</h1><Button variant="primary" onClick={() => setEditing('new')}>Add branch</Button></div>
      <p className="mt-1 text-sm text-muted">A GST-registered branch issues GST invoices. An unregistered branch issues bills of supply with no GST. Only the admin can change this.</p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Branch</th><th className="p-3 font-medium">Bills</th><th className="p-3 font-medium">Tag printer</th><th className="p-3 font-medium">WhatsApp</th></tr></thead>
          <tbody>{(list.data ?? []).map(b => (
            <tr key={b._id} className="cursor-pointer border-b border-line last:border-0 hover:bg-gold-wash" onClick={() => setEditing(b)}>
              <td className="p-3"><div className="font-medium">{b.name}{b.active === false && <span className="ml-2 rounded bg-canvas px-1.5 text-xs text-muted">closed</span>}</div><div className="text-xs text-muted">{b.code} · {b.state}{b.address ? ` · ${b.address}` : ''}</div></td>
              <td className="p-3">{b.gstRegistered === false ? <span className="text-warn">Bill of supply — no GST</span> : <>GST invoice<div className="text-xs text-muted">{b.gstin ?? <span className="text-danger">GSTIN not set</span>}</div></>}<div className="text-xs text-muted">numbers {b.invoicePrefix}-…</div></td>
              <td className="p-3 text-muted">{b.printer ? `${b.printer.tagSize?.replace('x', '×')} mm · ${b.printer.language === 'TSPL' ? 'TSPL' : 'ESC/POS'}` : '—'}</td>
              <td className="p-3 text-muted">{b.whatsappNumber ?? '—'}</td></tr>))}
          </tbody>
        </table>
      </div>
      {editing && <BranchForm branch={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['branches'] }); setEditing(null); }} />}
    </div>
  );
}

function BranchForm({ branch, onClose, onSaved }: { branch: any | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<F>(branch ? { ...blank, code: branch.code, prefix: branch.invoicePrefix, name: branch.name, address: branch.address ?? '', state: branch.state ?? 'Jharkhand',
    registered: branch.gstRegistered !== false, gstin: branch.gstin ?? '', whatsapp: branch.whatsappNumber ?? '', exchangeDisplay: branch.exchangeDisplay ?? 'AMOUNT', invoicePaper: branch.invoicePaper ?? 'A4', receiptPaper: branch.receiptPaper ?? 'A5',
    tagSize: branch.printer?.tagSize ?? '40x25', connection: branch.printer?.connection ?? 'usb', language: branch.printer?.language ?? 'ESCPOS', device: branch.printer?.deviceName ?? '', active: branch.active !== false } : blank);
  const set = (k: keyof F, v: any) => setF(x => ({ ...x, [k]: v }));
  const gstin = f.gstin.trim().toUpperCase();
  const gstinBad = f.registered && gstin !== '' && !GSTIN.test(gstin);
  const needsGstin = !!branch && branch.gstRegistered === false && f.registered && !gstin;           // an unregistered branch becoming registered must give its GSTIN
  const valid = f.name.trim().length >= 2 && (branch || (/^[A-Za-z0-9]{2,6}$/.test(f.code) && /^[A-Za-z0-9]{2,6}$/.test(f.prefix))) && !gstinBad && !needsGstin && (!f.whatsapp || /^[6-9]\d{9}$/.test(f.whatsapp));

  const save = useMutation({
    mutationFn: () => {
      const common = { name: f.name.trim(), address: f.address, state: f.state, gstRegistered: f.registered, exchangeDisplay: f.exchangeDisplay, invoicePaper: f.invoicePaper, receiptPaper: f.receiptPaper,
        ...(f.whatsapp && { whatsappNumber: f.whatsapp }), printer: { tagSize: f.tagSize, connection: f.connection, language: f.language, ...(f.device && { deviceName: f.device }) } };
      if (!branch) return api('/branches', { body: { ...common, code: f.code.toUpperCase(), invoicePrefix: f.prefix.toUpperCase(), ...(f.registered && gstin && { gstin }) } });
      return api(`/branches/${branch._id}`, { method: 'PATCH', body: { ...common, gstin: f.registered ? (gstin || undefined) : null, active: f.active } });   // null clears the GSTIN of an unregistered branch
    },
    onSuccess: onSaved,
  });

  return (
    <Modal title={branch ? `Edit ${branch.name}` : 'Add branch'} onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <Field label="Branch name"><Input autoFocus value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        {!branch && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Short code" hint="2–6 letters/digits, e.g. RNC1"><Input value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} maxLength={6} /></Field>
            <Field label="Bill number prefix" hint="Cannot be changed later"><Input value={f.prefix} onChange={e => set('prefix', e.target.value.toUpperCase())} maxLength={6} /></Field>
          </div>)}
        <Field label="Address (printed on bills)"><Input value={f.address} onChange={e => set('address', e.target.value)} /></Field>
        <Field label="State"><select className={inputCls} value={f.state} onChange={e => set('state', e.target.value)}>{INDIAN_STATES.map(s => <option key={s}>{s}</option>)}</select></Field>

        <fieldset className="space-y-2 rounded border border-line p-3 text-sm">
          <legend className="px-1 font-medium">GST</legend>
          <label className="flex gap-2"><input type="radio" checked={f.registered} onChange={() => set('registered', true)} /> <span><b>Registered</b> — issues GST invoices (CGST + SGST)</span></label>
          <label className="flex gap-2"><input type="radio" checked={!f.registered} onChange={() => set('registered', false)} /> <span><b>Not registered</b> — issues bills of supply, no GST charged</span></label>
          {f.registered && <Field label="GSTIN" error={gstinBad ? 'That does not look like a valid GSTIN' : needsGstin ? 'A GSTIN is needed to mark the branch as registered' : undefined}><Input value={f.gstin} onChange={e => set('gstin', e.target.value.toUpperCase())} maxLength={15} /></Field>}
          {branch && branch.gstRegistered !== f.registered && <p className="text-warn">Changing this affects every new bill. Drafts already open will ask to be re-saved. Old bills keep the type they were issued under.</p>}
        </fieldset>

        <Field label="WhatsApp number for customer enquiries" hint="10-digit mobile"><Input inputMode="numeric" maxLength={10} value={f.whatsapp} onChange={e => set('whatsapp', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Old gold on customer papers" hint="Showing the total fine weight as well lets a customer work out your rate, so the amount alone is the default.">
          <select className={inputCls} value={f.exchangeDisplay} onChange={e => set('exchangeDisplay', e.target.value)}><option value="AMOUNT">Amount only</option><option value="AMOUNT_AND_FINE_WEIGHT">Amount and total fine weight</option></select></Field>

        <fieldset className="grid grid-cols-2 gap-3 rounded border border-line p-3 text-sm">
          <legend className="px-1 font-medium">Paper for printouts</legend>
          <Field label="Bills and credit notes" hint="A5 is half of A4"><select className={inputCls} value={f.invoicePaper} onChange={e => set('invoicePaper', e.target.value)}><option value="A4">A4 — full page</option><option value="A5">A5 — half page</option></select></Field>
          <Field label="Receipts" hint="Advance, dues, dairy"><select className={inputCls} value={f.receiptPaper} onChange={e => set('receiptPaper', e.target.value)}><option value="A5">A5 — half page</option><option value="A4">A4 — full page</option></select></Field>
          <p className="col-span-2 text-xs text-muted">The cashier can still choose A4 or A5 for a single print.</p>
        </fieldset>

        <fieldset className="grid grid-cols-2 gap-3 rounded border border-line p-3 text-sm">
          <legend className="px-1 font-medium">Tag printer</legend>
          <Field label="Label size"><select className={inputCls} value={f.tagSize} onChange={e => set('tagSize', e.target.value)}><option value="40x25">40 × 25 mm</option><option value="50x25">50 × 25 mm</option></select></Field>
          <Field label="Printer language" hint="Most gap-sensor label printers use TSPL"><select className={inputCls} value={f.language} onChange={e => set('language', e.target.value)}><option value="ESCPOS">ESC/POS</option><option value="TSPL">TSPL</option></select></Field>
          <Field label="Connection"><select className={inputCls} value={f.connection} onChange={e => set('connection', e.target.value)}><option value="usb">USB</option><option value="bluetooth">Bluetooth</option><option value="agent">Print agent</option></select></Field>
          <Field label="Printer name (optional)"><Input value={f.device} onChange={e => set('device', e.target.value)} /></Field>
        </fieldset>

        {branch && <label className="flex gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Branch is open</label>}
        {save.error && <p className="text-sm text-danger" role="alert">{(save.error as Error).message}</p>}
        <Button type="submit" variant="primary" className="w-full" busy={save.isPending} disabled={!valid}>{branch ? 'Save changes' : 'Add branch'}</Button>
      </form>
    </Modal>);
}
