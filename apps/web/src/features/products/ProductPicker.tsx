import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { Input } from '@/components/ui/Field';
import { gradeOf } from './ProductsPage';

/** Type a name or SKU, tap a product. Shows stock at `branchId` when given. */
export function ProductPicker({ onPick, branchId, autoFocus }: { onPick: (p: any) => void; branchId?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(''), dq = useDebounced(q);
  const res = useQuery({ queryKey: ['picker', dq, branchId], queryFn: () => api<any>('/products', { query: { q: dq, limit: 8, active: 'true', branchId } }), enabled: dq.trim().length >= 2 });
  return (
    <div>
      <Input autoFocus={autoFocus} placeholder="Search product name or SKU" aria-label="Search products" value={q} onChange={e => setQ(e.target.value)} />
      {dq.trim().length >= 2 && (
        <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded border border-line">
          {(res.data?.items ?? []).map((p: any) => (
            <li key={p._id}><button type="button" className="flex w-full items-center justify-between gap-3 p-2 text-left text-sm hover:bg-gold-wash" onClick={() => { onPick(p); setQ(''); }}>
              <span><span className="font-medium">{p.name}</span><span className="block text-xs text-muted">{p.sku} · {gradeOf(p)}</span></span>
              {p.stockQty !== undefined && <span className="num text-muted">{p.stockQty} in stock</span>}</button></li>))}
          {!res.isLoading && (res.data?.items ?? []).length === 0 && <li className="p-3 text-sm text-muted">No product found.</li>}
        </ul>)}
    </div>);
}
