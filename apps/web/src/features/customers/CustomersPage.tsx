import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

export function CustomersPage() {
  const nav = useNavigate(), [q, setQ] = useState(''), [page, setPage] = useState(1), [adding, setAdding] = useState(false), dq = useDebounced(q);
  const list = useQuery({ queryKey: ['customers-list', dq, page], queryFn: () => api('/customers', { query: { q: dq, page, limit: 20 } }), placeholderData: keepPreviousData });
  const items: any[] = list.data?.items ?? [], pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between gap-3"><h1 className="font-display text-2xl">Customers</h1><Button variant="primary" onClick={() => setAdding(true)}>Add customer</Button></div>
      <Input className="mt-4 max-w-xs" placeholder="Search name or mobile" aria-label="Search customers" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Mobile</th><th className="p-3 font-medium">Address</th></tr></thead>
          <tbody>{items.map(c => <tr key={c._id} className="cursor-pointer border-b border-line last:border-0 hover:bg-gold-wash" onClick={() => nav(`/customers/${c._id}`)}><td className="p-3 font-medium">{c.name}</td><td className="p-3">{c.mobile}</td><td className="p-3 text-muted">{c.address}</td></tr>)}
            {!list.isLoading && items.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-muted">No customers found.</td></tr>}</tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted"><span>{list.data?.total ?? 0} customers</span>
        <span className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></span></div>
      {adding && <CustomerForm onClose={() => setAdding(false)} onSaved={c => nav(`/customers/${c._id}`)} />}
    </div>
  );
}

/** Add or edit a customer. */
export function CustomerForm({ customer, onClose, onSaved }: { customer?: any; onClose: () => void; onSaved: (c: any) => void }) {
  const [name, setName] = useState(customer?.name ?? ''), [mobile, setMobile] = useState(customer?.mobile ?? ''), [address, setAddress] = useState(customer?.address ?? ''), [remarks, setRemarks] = useState(customer?.remarks ?? '');
  const save = useMutation({
    mutationFn: () => api(customer ? `/customers/${customer._id}` : '/customers', { method: customer ? 'PATCH' : 'POST', body: { name: name.trim(), mobile, address, remarks } }),
    onSuccess: onSaved,
  });
  return (
    <Modal title={customer ? 'Edit customer' : 'Add customer'} onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name"><Input autoFocus value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Mobile number"><Input inputMode="numeric" maxLength={10} value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Address"><Input value={address} onChange={e => setAddress(e.target.value)} /></Field>
        <Field label="Remarks"><Input value={remarks} onChange={e => setRemarks(e.target.value)} /></Field>
        {save.error && <p className="text-sm text-danger" role="alert">{(save.error as Error).message}</p>}
        <Button type="submit" variant="primary" className="w-full" busy={save.isPending} disabled={name.trim().length < 2 || !/^[6-9]\d{9}$/.test(mobile)}>Save</Button>
      </form>
    </Modal>);
}
