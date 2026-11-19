import { useMutation, useQuery } from '@tanstack/react-query';
import { forwardRef, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { KeyHint } from '@/components/ui/Status';
import { localCustomers } from '@/offline/local';
import type { CustomerLite } from './types';

export const CustomerPicker = forwardRef<HTMLInputElement, { value: CustomerLite | null; onChange: (c: CustomerLite | null) => void; offline?: boolean }>(({ value, onChange, offline }, ref) => {
  const [q, setQ] = useState(''), [debounced, setDebounced] = useState(''), [adding, setAdding] = useState(false), [name, setName] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 200); return () => clearTimeout(t); }, [q]);
  const found = useQuery({ queryKey: ['customers', debounced, !!offline], queryFn: () => (offline ? localCustomers(debounced).then(items => ({ items })) : api<{ items: CustomerLite[] }>('/customers', { query: { q: debounced, limit: 6 } })), enabled: debounced.length >= 3 });
  const create = useMutation({
    mutationFn: async (): Promise<CustomerLite> => (offline ? { _id: `new:${q.trim()}`, name, mobile: q.trim(), isNew: true } : api<CustomerLite>('/customers', { body: { name, mobile: q.trim() } })),
    onSuccess: c => { onChange(c); setAdding(false); setQ(''); setName(''); },
  });
  const isMobile = /^[6-9]\d{9}$/.test(q.trim());

  if (value) return (
    <div className="flex items-center justify-between rounded border border-line bg-paper px-3 py-2">
      <div><div className="font-medium">{value.name}</div><div className="text-xs text-muted">{value.mobile}</div></div>
      <Button variant="ghost" onClick={() => onChange(null)}>Change</Button>
    </div>);

  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-sm font-medium">Customer <KeyHint k="F3" /></label>
      <Input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Mobile number or name" aria-label="Customer" />
      <ul className="mt-2 space-y-1">
        {found.data?.items.map(c => (
          <li key={c._id}><button onClick={() => onChange(c)} className="flex w-full justify-between rounded border border-line bg-paper px-3 py-2 text-left hover:border-gold">
            <span>{c.name}</span><span className="text-sm text-muted">{c.mobile}</span></button></li>))}
      </ul>
      {debounced.length >= 3 && found.data?.items.length === 0 && !adding && (
        <div className="mt-2 text-sm text-muted">No customer found.{isMobile && <> <button className="text-gold-deep underline" onClick={() => setAdding(true)}>Add {q.trim()} as a new customer</button></>}</div>)}
      {adding && (
        <form className="mt-2 space-y-2" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" aria-label="New customer name" />
          {create.error && <p className="text-sm text-danger">{(create.error as Error).message}</p>}
          <div className="flex gap-2"><Button type="submit" variant="primary" busy={create.isPending} disabled={name.trim().length < 2}>Save customer</Button><Button type="button" onClick={() => setAdding(false)}>Cancel</Button></div>
        </form>)}
    </div>);
    
});

CustomerPicker.displayName = 'CustomerPicker';
