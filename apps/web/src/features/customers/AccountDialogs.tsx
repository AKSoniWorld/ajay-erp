import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatINR, rupeesToPaise } from '@/lib/format';
import { useActiveBranch } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PrintButton } from '@/components/ui/PrintPdf';
import { num } from '@/features/pos/types';

const MODES = [['CASH', 'Cash'], ['UPI', 'UPI'], ['CARD', 'Card']] as const;
const ModeSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <select aria-label="Payment mode" className={inputCls} value={value} onChange={e => onChange(e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>);

/** Money received from the customer: an advance, or a payment against what they owe (kind = 'advance' | 'dues/payments'). Gives a numbered receipt. */
export function ReceiveDialog({ customerId, kind, due, onClose, onDone }: { customerId: string; kind: 'advance' | 'dues/payments'; due?: number; onClose: () => void; onDone: () => void }) {
  const branch = useActiveBranch(), [amount, setAmount] = useState(kind === 'dues/payments' && due ? (due / 100).toFixed(2) : ''), [mode, setMode] = useState('CASH'), [ref, setRef] = useState('');
  const m = useMutation({ mutationFn: () => api<any>(`/customers/${customerId}/${kind}`, { body: { branchId: branch!._id, amountPaise: rupeesToPaise(num(amount)), mode, ...(ref && { ref }) } }), onSuccess: onDone });
  const title = kind === 'advance' ? 'Receive an advance' : 'Collect payment of dues';
  if (m.data) return (
    <Modal title="Receipt" onClose={onClose}>
      <p className="text-sm">Saved. Receipt <b>{m.data.receiptNo}</b></p>
      <div className="flex gap-2"><PrintButton kind="receipt" label="Print receipt" path={`/customers/${customerId}/receipts/${m.data.receiptNo}/pdf`} /><Button onClick={onClose}>Done</Button></div>
    </Modal>);
  return (
    <Modal title={title} onClose={onClose}>
      {kind === 'dues/payments' && due !== undefined && <p className="text-sm text-muted">Outstanding: {formatINR(due)}</p>}
      <Field label="Amount (₹)"><Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <Field label="Paid by"><ModeSelect value={mode} onChange={setMode} /></Field>
      <Field label="Reference (optional)" hint="UPI id, card slip…"><Input value={ref} onChange={e => setRef(e.target.value)} /></Field>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={!branch || num(amount) <= 0} onClick={() => m.mutate()}>Save and issue receipt</Button>
    </Modal>);
}

export function RefundDialog({ customerId, balance, onClose, onDone }: { customerId: string; balance: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState((balance / 100).toFixed(2)), [mode, setMode] = useState('CASH'), [reason, setReason] = useState('');
  const m = useMutation({ mutationFn: () => api(`/customers/${customerId}/advance/refund`, { body: { amountPaise: rupeesToPaise(num(amount)), mode, reason } }), onSuccess: onDone });
  return (
    <Modal title="Refund the advance" onClose={onClose}>
      <p className="text-sm text-muted">Unused advance: {formatINR(balance)}</p>
      <Field label="Amount to refund (₹)"><Input autoFocus inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <Field label="Refunded by"><ModeSelect value={mode} onChange={setMode} /></Field>
      <Field label="Reason"><Input value={reason} onChange={e => setReason(e.target.value)} /></Field>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="danger" className="w-full" busy={m.isPending} disabled={num(amount) <= 0 || reason.trim().length < 3} onClick={() => m.mutate()}>Refund</Button>
    </Modal>);
}

/** Admin only: correct a balance or write off a due. Always recorded with the reason. */
export function AdjustDialog({ customerId, onClose, onDone }: { customerId: string; onClose: () => void; onDone: () => void }) {
  const [account, setAccount] = useState('DUE'), [type, setType] = useState('DECREASE'), [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const m = useMutation({ mutationFn: () => api(`/customers/${customerId}/adjustments`, { body: { account, type, amountPaise: rupeesToPaise(num(amount)), reason } }), onSuccess: onDone });
  return (
    <Modal title="Correct a balance" onClose={onClose}>
      <Field label="Account"><select className={inputCls} value={account} onChange={e => setAccount(e.target.value)}><option value="DUE">Due (what they owe)</option><option value="ADVANCE">Advance (what we hold)</option></select></Field>
      <Field label="Change"><select className={inputCls} value={type} onChange={e => setType(e.target.value)}><option value="DECREASE">Reduce it{account === 'DUE' ? ' (write off)' : ''}</option><option value="INCREASE">Increase it</option></select></Field>
      <Field label="Amount (₹)"><Input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></Field>
      <Field label="Reason"><Input value={reason} onChange={e => setReason(e.target.value)} /></Field>
      {m.error && <p className="text-sm text-danger" role="alert">{(m.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={m.isPending} disabled={num(amount) <= 0 || reason.trim().length < 3} onClick={() => m.mutate()}>Save correction</Button>
    </Modal>);
}
