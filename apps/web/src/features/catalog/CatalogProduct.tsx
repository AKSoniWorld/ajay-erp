import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { grams } from '@/lib/format';
import { CatalogHeader, Photo, WhatsApp, gradeText } from './CatalogPage';

/** One piece, as a customer sees it — reached from the collection or from a link someone shared. */
export function CatalogProduct() {
  const { sku } = useParams(), [i, setI] = useState(0);
  const q = useQuery({ queryKey: ['pub-product', sku], queryFn: () => api<any>(`/public/products/${sku}`), retry: false });
  const p = q.data;
  useEffect(() => { document.title = p ? `${p.name} — Ajay Jewellers` : 'Ajay Jewellers'; }, [p]);
  return (
    <div className="min-h-full bg-canvas text-ink">
      <CatalogHeader />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Link to="/catalog" className="text-sm text-muted hover:underline">← Our collection</Link>
        {q.isError && <p className="mt-6" role="alert">We could not find this piece. <Link to="/catalog" className="underline">See the collection</Link>.</p>}
        {p && (
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <Photo p={{ ...p, images: p.images?.slice(i) }} className="aspect-square w-full rounded-lg border border-line" />
              {p.images?.length > 1 && <div className="mt-2 flex gap-2">{p.images.map((u: string, n: number) => <button key={u} aria-label={`Photo ${n + 1}`} onClick={() => setI(n)} className={`h-16 w-16 overflow-hidden rounded border ${n === i ? 'border-gold' : 'border-line'}`}><img src={u} alt="" className="h-full w-full object-cover" /></button>)}</div>}
            </div>
            <div>
              <h1 className="font-display text-3xl">{p.name}</h1>
              <p className="mt-1 text-sm text-muted">{p.category}{p.subcategory ? ` · ${p.subcategory}` : ''} · {p.sku}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded border border-line bg-paper p-3"><dt className="text-muted">Metal</dt><dd className="font-medium">{gradeText(p)}</dd></div>
                <div className="rounded border border-line bg-paper p-3"><dt className="text-muted">Weight</dt><dd className="font-medium">{grams(p.grossMg)}{p.netMg !== p.grossMg && <span className="text-muted"> (metal {grams(p.netMg)})</span>}</dd></div>
              </dl>
              <p className="mt-4 text-sm text-muted">The price follows the day’s rate, so we quote it when you ask.</p>
              <h2 className="mt-6 font-medium">Where to see it</h2>
              {p.availability.length === 0
                ? <p className="mt-2 text-sm text-muted">It is not on the shelf right now. Message us and we will tell you when we can have it.</p>
                : <ul className="mt-2 space-y-3">{p.availability.map((a: any) => <li key={a.branchId} className="flex items-center justify-between gap-3 rounded border border-line bg-paper p-3 text-sm"><span><span className="font-medium">{a.branch}</span><span className="block text-muted">{a.address}</span></span><WhatsApp href={a.whatsapp}>Ask here</WhatsApp></li>)}</ul>}
              {p.availability.length === 0 && <div className="mt-3"><WhatsApp href={p.enquiry} /></div>}
            </div>
          </div>)}
      </main>
    </div>);
}
