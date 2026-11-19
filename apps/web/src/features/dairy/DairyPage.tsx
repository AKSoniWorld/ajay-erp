import { hasPermission } from '@ajay/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateIST, formatINR, rupeesToPaise, todayIST } from '@/lib/format';
import { useActiveBranch, useDebounced } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Money } from '@/components/ui/Money';
import { CustomerPicker } from '@/features/pos/CustomerPicker';
import { CustomerLite, num } from '@/features/pos/types';

export const STATUS_TEXT: Record<string, string> = { ACTIVE: 'Running', COMPLETED: 'Completed', MATURED_SHORTFALL: 'Past end date — not fully paid', REDEEMED: 'Fully used' };
export const STATUS_COLOR: Record<string, string> = { ACTIVE: 'text-ok', COMPLETED: 'text-gold-deep', MATURED_SHORTFALL: 'text-warn', REDEEMED: 'text-muted' };

export function DairyPage() {
  const role = useAuth(s => s.user!.role), nav = useNavigate(), [q, setQ] = useState(''), [page, setPage] = useState(1), [creating, setCreating] = useState(false), dq = useDebounced(q);
  const list = useQuery({ queryKey: ['dairy-list', dq, page], queryFn: () => api('/dairy/schemes', { query: { q: dq, page, limit: 20 } }), placeholderData: keepPreviousData });
  const items: any[] = list.data?.items ?? [], pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-3"><h1 className="font-display text-2xl">Dairy savings</h1>{hasPermission(role, 'dairy.create') && <Button variant="primary" onClick={() => setCreating(true)}>New scheme</Button>}</div>
      <Input className="mt-4 max-w-xs" placeholder="Scheme number" aria-label="Search schemes" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Scheme</th><th className="p-3 font-medium">Customer</th><th className="p-3 font-medium">Status</th><th className="p-3 text-right font-medium">Instalments</th><th className="p-3 text-right font-medium">Missed</th><th className="p-3 text-right font-medium">Balance</th><th className="p-3 font-medium">Ends</th></tr></thead>
          <tbody>{items.map(s => (
            <tr key={s._id} className="cursor-pointer border-b border-line last:border-0 hover:bg-gold-wash" onClick={() => nav(`/dairy/${s._id}`)}>
              <td className="p-3 font-medium">{s.schemeNo}{s.schemeType === 'BONUS' && <span className="ml-2 rounded bg-canvas px-1.5 text-xs text-muted">bonus</span>}</td>
              <td className="p-3">{s.customer?.name ?? '—'}</td><td className={`p-3 ${STATUS_COLOR[s.status]}`}>{STATUS_TEXT[s.status] ?? s.status}</td>
              <td className="p-3 text-right num">{s.paidMonths} of {s.durationMonths}</td><td className={`p-3 text-right num ${s.missedMonths > 0 ? 'text-warn' : ''}`}>{s.missedMonths}</td>
              <td className="p-3 text-right"><Money paise={s.balancePaise} /></td><td className="p-3 whitespace-nowrap text-muted">{dateIST(s.maturityDate)}</td></tr>))}
            {!list.isLoading && items.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted">No schemes yet.</td></tr>}</tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted"><span>{list.data?.total ?? 0} schemes</span>
        <span className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></span></div>
      {creating && <NewScheme onClose={() => setCreating(false)} onCreated={s => nav(`/dairy/${s._id}`)} />}
    </div>
  );
}

function NewScheme({ onClose, onCreated }: { onClose: () => void; onCreated: (s: any) => void }) {
  const branch = useActiveBranch(), [customer, setCustomer] = useState<CustomerLite | null>(null), [start, setStart] = useState(todayIST());
  const [monthly, setMonthly] = useState(''), [months, setMonths] = useState('11'), [type, setType] = useState('BONUS'), [bonus, setBonus] = useState('1');
  const create = useMutation({
    mutationFn: () => api('/dairy/schemes', { body: { customerId: customer!._id, branchId: branch!._id, startDate: `${start}T00:00:00+05:30`, monthlyPaise: rupeesToPaise(num(monthly)),
      durationMonths: Number(months), type, ...(type === 'BONUS' && { bonusInstallments: Number(bonus) }) } }),
    onSuccess: onCreated,
  });
  const ok = !!customer && !!branch && num(monthly) >= 100 && Number.isInteger(num(monthly));
  return (
    <Modal title="New dairy scheme" onClose={onClose}>
      <CustomerPicker value={customer} onChange={setCustomer} />
      <Field label="Monthly amount (₹)" hint="Whole rupees, at least ₹100"><Input inputMode="numeric" value={monthly} onChange={e => setMonthly(e.target.value.replace(/\D/g, ''))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Months"><select className={inputCls} value={months} onChange={e => setMonths(e.target.value)}><option value="6">6</option><option value="11">11</option><option value="12">12</option></select></Field>
        <Field label="Starts on"><input type="date" className={inputCls} value={start} onChange={e => setStart(e.target.value)} /></Field>
      </div>
      <Field label="Type"><select className={inputCls} value={type} onChange={e => setType(e.target.value)}><option value="BONUS">With bonus — extra instalment(s) added when fully paid</option><option value="NORMAL">Normal — no bonus</option></select></Field>
      {type === 'BONUS' && <Field label="Bonus instalments"><select className={inputCls} value={bonus} onChange={e => setBonus(e.target.value)}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></Field>}
      {create.error && <p className="text-sm text-danger" role="alert">{(create.error as Error).message}</p>}
      <Button variant="primary" className="w-full" busy={create.isPending} disabled={!ok} onClick={() => create.mutate()}>Create scheme</Button>
      <p className="text-xs text-muted">{formatINR(rupeesToPaise(num(monthly)) * Number(months), { decimals: false })} in total over {months} months.</p>
    </Modal>);
}
