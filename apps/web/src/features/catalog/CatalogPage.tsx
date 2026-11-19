import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { grams } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

export const gradeText = (p: any) => (p.metal === 'GOLD' ? `${p.karat}K gold` : p.metal === 'SILVER' ? `Silver ${p.purityPct}%` : 'Diamond');
export const WhatsApp = ({ href, children }: { href?: string | null; children?: React.ReactNode }) => href
  ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded bg-[#1f8f4e] px-3 py-2 text-sm font-semibold text-white hover:brightness-95">{children ?? 'Ask on WhatsApp'}</a> : null;

export function CatalogHeader() {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <Link to="/catalog" className="font-display text-2xl text-gold-deep">Ajay Jewellers</Link>
        <span className="hidden text-sm text-muted sm:block">Ranchi · Gold · Silver · Diamond</span>
      </div>
    </header>);
}

export function Photo({ p, className = '' }: { p: any; className?: string }) {
  return p.images?.[0]
    ? <img src={p.images[0]} alt={p.name} loading="lazy" className={`object-cover ${className}`} />
    : <div aria-hidden className={`flex items-center justify-center bg-gold-wash font-display text-4xl text-gold-deep ${className}`}>{p.metal === 'GOLD' ? 'Au' : p.metal === 'SILVER' ? 'Ag' : '◇'}</div>;
}

/** What customers see: pieces and where they are available. No prices — they ask us on WhatsApp or visit. */
export function CatalogPage() {
  const [q, setQ] = useState(''), [metal, setMetal] = useState(''), [categoryId, setCat] = useState(''), [branchId, setBranch] = useState(''), [inStock, setInStock] = useState(true), dq = useDebounced(q, 300);
  useEffect(() => { document.title = 'Ajay Jewellers — Collection'; }, []);
  const cats = useQuery({ queryKey: ['pub-cats'], queryFn: () => api<any[]>('/public/categories'), staleTime: 10 * 60_000 });
  const shops = useQuery({ queryKey: ['pub-shops'], queryFn: () => api<any[]>('/public/branches'), staleTime: 10 * 60_000 });
  const list = useInfiniteQuery({
    queryKey: ['pub-products', dq, metal, categoryId, branchId, inStock],
    queryFn: ({ pageParam }) => api<any>('/public/products', { query: { q: dq, metal, categoryId, branchId, inStock: inStock && !branchId ? 'true' : '', page: pageParam, limit: 24 } }),
    initialPageParam: 1, getNextPageParam: l => (l.page * l.limit < l.total ? l.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap(p => p.items) ?? [], total = list.data?.pages[0]?.total ?? 0;
  const chip = (v: string, label: string) => <button key={v} onClick={() => setMetal(v)} aria-pressed={metal === v} className={`rounded-full border px-4 py-1.5 text-sm ${metal === v ? 'border-gold bg-gold-wash text-gold-deep' : 'border-line text-muted hover:border-gold'}`}>{label}</button>;

  return (
    <div className="min-h-full bg-canvas text-ink">
      <CatalogHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="font-display text-3xl">Our collection</h1>
        <p className="mt-1 text-sm text-muted">Prices depend on the day’s gold and silver rate — message us on WhatsApp or visit the shop for today’s price.</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">{chip('', 'All')}{chip('GOLD', 'Gold')}{chip('SILVER', 'Silver')}{chip('DIAMOND', 'Diamond')}</div>
        <div className="mt-3 flex flex-wrap gap-3">
          <input aria-label="Search" placeholder="Search a piece" className="min-w-[12rem] flex-1 rounded border border-line bg-paper px-3 py-2 text-sm" value={q} onChange={e => setQ(e.target.value)} />
          <select aria-label="Category" className="rounded border border-line bg-paper px-3 py-2 text-sm" value={categoryId} onChange={e => setCat(e.target.value)}><option value="">All types</option>{cats.data?.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
          <select aria-label="Shop" className="rounded border border-line bg-paper px-3 py-2 text-sm" value={branchId} onChange={e => setBranch(e.target.value)}><option value="">Any shop</option>{shops.data?.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}</select>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={inStock || !!branchId} disabled={!!branchId} onChange={e => setInStock(e.target.checked)} /> Available now</label>
        </div>

        {list.isError && <p className="mt-6 text-sm text-danger" role="alert">The collection could not be loaded. Check your internet connection and try again.</p>}
        <p className="mt-5 text-sm text-muted">{list.isLoading ? 'Loading…' : `${total} piece${total === 1 ? '' : 's'}`}</p>
        <ul className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map(p => (
            <li key={p._id} className="flex flex-col overflow-hidden rounded-lg border border-line bg-paper">
              <Link to={`/catalog/${p.sku}`} className="block"><Photo p={p} className="aspect-square w-full" /></Link>
              <div className="flex flex-1 flex-col p-3">
                <Link to={`/catalog/${p.sku}`} className="font-medium hover:underline">{p.name}</Link>
                <div className="text-xs text-muted">{gradeText(p)} · {grams(p.netMg)}</div>
                <div className="mt-1 text-xs">{p.availability.length ? <span className="text-ok">Available at {p.availability.map((a: any) => a.branch).join(', ')}</span> : <span className="text-muted">Ask us — we can arrange it</span>}</div>
                <div className="mt-auto pt-3"><WhatsApp href={p.availability[0]?.whatsapp ?? p.enquiry} /></div>
              </div>
            </li>))}
        </ul>
        {!list.isLoading && items.length === 0 && <p className="mt-10 text-center text-muted">No pieces match. Try another search, or message us and we will help you find something.</p>}
        {list.hasNextPage && <div className="mt-6 text-center"><button className="rounded border border-line bg-paper px-5 py-2 text-sm hover:border-gold" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>{list.isFetchingNextPage ? 'Loading…' : 'Show more'}</button></div>}
      </main>

      <footer className="mt-10 border-t border-line bg-paper">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
          {shops.data?.map(b => <div key={b._id} className="text-sm"><div className="font-medium">{b.name}</div><div className="text-muted">{b.address}</div>{b.whatsapp && <a className="mt-1 inline-block text-gold-deep underline" href={b.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp this shop</a>}</div>)}
        </div>
      </footer>
    </div>);
}
