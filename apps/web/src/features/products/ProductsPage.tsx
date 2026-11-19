import { hasPermission } from '@ajay/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { grams } from '@/lib/format';
import { useActiveBranch, useDebounced } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Input, inputCls } from '@/components/ui/Field';
import { TagDialog, TagItem } from './TagDialog';

export const gradeOf = (p: any) => (p.metal === 'GOLD' ? `${p.karat}K` : p.metal === 'SILVER' ? `Silver ${p.purityPct}%` : 'Diamond');
export const makingText = (p: any) => (p.makingType === 'PERCENT' ? `${p.makingValue / 100}%` : p.makingType === 'PER_GRAM' ? `₹ ${(p.makingValue / 100).toLocaleString('en-IN')} /g` : `₹ ${(p.makingValue / 100).toLocaleString('en-IN')}`);

export function ProductsPage() {
  const role = useAuth(s => s.user!.role), branch = useActiveBranch(), nav = useNavigate();
  const [q, setQ] = useState(''), [metal, setMetal] = useState(''), [categoryId, setCat] = useState(''), [page, setPage] = useState(1);
  const [sel, setSel] = useState<Record<string, TagItem>>({}), [tags, setTags] = useState<TagItem[] | null>(null);
  const dq = useDebounced(q);
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<any[]>('/categories'), staleTime: 5 * 60_000 });
  const list = useQuery({
    queryKey: ['products', dq, metal, categoryId, page, branch?._id],
    queryFn: () => api('/products', { query: { q: dq, metal, categoryId, page, limit: 20, branchId: branch?._id } }),
    placeholderData: keepPreviousData,
  });
  const items: any[] = list.data?.items ?? [], pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  const toggle = (p: any) => setSel(s => { const n = { ...s }; if (n[p._id]) delete n[p._id]; else n[p._id] = { productId: p._id, name: p.name, sku: p.sku, copies: 1 }; return n; });
  const picked = Object.values(sel);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Products</h1>
        <div className="flex gap-2">
          <Button disabled={!picked.length} onClick={() => setTags(picked)}><Printer size={16} /> Print tags{picked.length ? ` (${picked.length})` : ''}</Button>
          {hasPermission(role, 'product.write') && <Link to="/products/new" className="inline-flex items-center rounded bg-gold px-4 py-2 text-sm font-semibold text-[#17130a] hover:brightness-95">Add product</Link>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Search name or SKU" aria-label="Search products" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
        <select aria-label="Metal" className={`${inputCls} !w-auto`} value={metal} onChange={e => { setMetal(e.target.value); setPage(1); }}>
          <option value="">All metals</option><option value="GOLD">Gold</option><option value="SILVER">Silver</option><option value="DIAMOND">Diamond</option>
        </select>
        <select aria-label="Category" className={`${inputCls} !w-auto`} value={categoryId} onChange={e => { setCat(e.target.value); setPage(1); }}>
          <option value="">All categories</option>{cats.data?.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted">
            <th className="w-10 p-3" /><th className="p-3 font-medium">Item</th><th className="p-3 font-medium">Grade</th>
            <th className="p-3 text-right font-medium">Net weight</th><th className="p-3 text-right font-medium">Making</th><th className="p-3 text-right font-medium">In stock{branch ? ` (${branch.name})` : ''}</th>
          </tr></thead>
          <tbody>
            {items.map(p => (
              <tr key={p._id} className="cursor-pointer border-b border-line last:border-0 hover:bg-gold-wash" onClick={() => nav(`/products/${p._id}`)}>
                <td className="p-3" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${p.name}`} checked={!!sel[p._id]} onChange={() => toggle(p)} /></td>
                <td className="p-3"><div className="flex items-center gap-3">
                  {p.images?.[0] ? <img src={p.images[0]} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-canvas" />}
                  <div><div className="font-medium">{p.name}{p.active === false && <span className="ml-2 rounded bg-canvas px-1.5 text-xs text-muted">inactive</span>}</div><div className="text-xs text-muted">{p.sku}</div></div></div></td>
                <td className="p-3">{gradeOf(p)}</td>
                <td className="p-3 text-right num">{grams(p.netMg)}</td>
                <td className="p-3 text-right num">{makingText(p)}</td>
                <td className={`p-3 text-right num ${p.stockQty === 0 ? 'text-danger' : ''}`}>{p.stockQty ?? '—'}</td>
              </tr>))}
            {!list.isLoading && items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted">No products found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted">
        <span>{list.data?.total ?? 0} products</span>
        <span className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></span>
      </div>
      {tags && <TagDialog initial={tags} onClose={() => setTags(null)} />}
    </div>
  );
}
