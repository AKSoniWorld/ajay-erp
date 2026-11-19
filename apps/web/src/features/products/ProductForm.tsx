import { hasPermission } from '@ajay/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { rupeesToPaise } from '@/lib/format';
import { useActiveBranch, useBranches } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { num } from '@/features/pos/types';
import { TagDialog } from './TagDialog';

const blank = { name: '', shortName: '', categoryId: '', subcategoryId: '', metal: 'GOLD', karat: '22', purity: '92.5', gross: '', net: '', makingType: 'PER_GRAM', making: '', stone: '', hsn: '', openingQty: '' };
type F = typeof blank;
const mg = (s: string) => Math.round(num(s) * 1000);

export function ProductForm() {
  const { id } = useParams(), [sp] = useSearchParams(), nav = useNavigate(), qc = useQueryClient();
  const role = useAuth(s => s.user!.role), branch = useActiveBranch(), { data: branches } = useBranches();
  const canWrite = hasPermission(role, 'product.write'), canStock = hasPermission(role, 'inventory.write');
  const [f, setF] = useState<F>(blank), [qr, setQr] = useState(''), [tag, setTag] = useState(false), [err, setErr] = useState('');
  const set = (k: keyof F, v: string) => setF(x => ({ ...x, [k]: v }));

  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<any[]>('/categories') });
  const product = useQuery({ queryKey: ['product', id], queryFn: () => api(`/products/${id}`), enabled: !!id });
  const p = product.data;
  useEffect(() => {
    if (!p) return;
    setF({ name: p.name, shortName: p.shortName ?? '', categoryId: p.categoryId, subcategoryId: p.subcategoryId, metal: p.metal, karat: String(p.karat ?? 22),
      purity: String(p.purityPct ?? 92.5), gross: String(p.grossMg / 1000), net: String(p.netMg / 1000), makingType: p.makingType,
      making: String(p.makingValue / 100), stone: String((p.stoneValuePaise ?? 0) / 100), hsn: p.hsn ?? '', openingQty: '' });
    QRCode.toDataURL(p.qrPayload, { margin: 1, width: 180, errorCorrectionLevel: 'M' }).then(setQr);
  }, [p]);

  const subs = cats.data?.find(c => c._id === f.categoryId)?.children ?? [];
  const body = () => ({
    name: f.name.trim(), ...(f.shortName.trim() && { shortName: f.shortName.trim() }), categoryId: f.categoryId, subcategoryId: f.subcategoryId, metal: f.metal,
    ...(f.metal === 'GOLD' ? { karat: Number(f.karat) } : { purityPct: num(f.purity) }),
    grossMg: mg(f.gross), netMg: f.net ? mg(f.net) : mg(f.gross), makingType: f.makingType,
    makingValue: f.makingType === 'PERCENT' ? Math.round(num(f.making) * 100) : rupeesToPaise(num(f.making)),   // % → basis points, ₹ → paise
    stoneValuePaise: rupeesToPaise(num(f.stone)), ...(f.hsn && { hsn: f.hsn }),
  });
  const valid = f.name.trim().length >= 2 && f.categoryId && f.subcategoryId && mg(f.gross) > 0 && (!f.net || mg(f.net) <= mg(f.gross)) && f.making !== '';

  const save = useMutation({
    mutationFn: async () => {
      setErr('');
      if (id) return api(`/products/${id}`, { method: 'PATCH', body: body() });
      const created = await api('/products', { body: body() });
      if (canStock && branch && Number(f.openingQty) > 0) await api('/inventory/adjust', { body: { productId: created._id, branchId: branch._id, qty: Number(f.openingQty), type: 'OPENING' } });
      return created;
    },
    onSuccess: r => { qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['product', id] }); if (!id) nav(`/products/${r._id}?new=1`); },
    onError: e => setErr((e as Error).message),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 3 * 1024 * 1024) throw new Error('The photo is larger than 3 MB.');
      const fd = new FormData(); fd.append('file', file); return api(`/products/${id}/images`, { body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product', id] }), onError: e => setErr((e as Error).message),
  });
  const removeImg = useMutation({ mutationFn: (url: string) => api(`/products/${id}/images/${url.split('/').pop()}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['product', id] }) });
  const setActive = useMutation({ mutationFn: (active: boolean) => api(`/products/${id}`, { method: 'PATCH', body: { active } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['product', id] }) });

  const dis = !canWrite;
  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link to="/products" className="text-sm text-muted hover:underline">← Products</Link>
      <h1 className="mt-1 font-display text-2xl">{id ? (p?.name ?? 'Product') : 'Add product'}</h1>

      {sp.get('new') && p && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-gold bg-gold-wash p-4 text-sm">
          <span>Saved as <b>{p.sku}</b>. Print its QR tag so it can be scanned at the counter.</span><Button variant="primary" onClick={() => setTag(true)}>Print tag</Button>
        </div>)}

      <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name"><Input disabled={dis} value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Gold Chain 22K" autoFocus={!id} /></Field>
        <Field label="Name on the tag" hint="Short, up to about 16 letters. Leave empty to use the start of the name."><Input disabled={dis} value={f.shortName} onChange={e => set('shortName', e.target.value)} maxLength={20} /></Field>
        <Field label="Category"><select disabled={dis} className={inputCls} value={f.categoryId} onChange={e => setF(x => ({ ...x, categoryId: e.target.value, subcategoryId: '' }))}><option value="">Choose…</option>{cats.data?.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
        <Field label="Type"><select disabled={dis || !f.categoryId} className={inputCls} value={f.subcategoryId} onChange={e => set('subcategoryId', e.target.value)}><option value="">Choose…</option>{subs.map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
        <Field label="Metal"><select disabled={dis} className={inputCls} value={f.metal} onChange={e => set('metal', e.target.value)}><option value="GOLD">Gold</option><option value="SILVER">Silver</option><option value="DIAMOND">Diamond</option></select></Field>
        {f.metal === 'GOLD'
          ? <Field label="Karat" hint="Decides which gold rate prices this piece"><select disabled={dis} className={inputCls} value={f.karat} onChange={e => set('karat', e.target.value)}><option value="24">24K (100%)</option><option value="22">22K (91.6%)</option><option value="18">18K (75%)</option></select></Field>
          : <Field label="Purity %" hint="Shown on the tag and bill"><Input disabled={dis} inputMode="decimal" value={f.purity} onChange={e => set('purity', e.target.value)} /></Field>}
        <Field label="Gross weight (g)"><Input disabled={dis} inputMode="decimal" value={f.gross} onChange={e => set('gross', e.target.value)} /></Field>
        <Field label="Net metal weight (g)" hint="Weight without stones. Leave empty if the same as gross." error={f.net && mg(f.net) > mg(f.gross) ? 'Net cannot be more than gross' : undefined}><Input disabled={dis} inputMode="decimal" value={f.net} onChange={e => set('net', e.target.value)} /></Field>
        <Field label="Making charge is">
          <select disabled={dis} className={inputCls} value={f.makingType} onChange={e => set('makingType', e.target.value)}>
            <option value="PER_GRAM">₹ per gram of net weight</option><option value="FLAT">A fixed ₹ amount per piece</option><option value="PERCENT">% of the metal value</option></select></Field>
        <Field label={f.makingType === 'PERCENT' ? 'Making (%)' : f.makingType === 'PER_GRAM' ? 'Making (₹ per gram)' : 'Making (₹)'}><Input disabled={dis} inputMode="decimal" value={f.making} onChange={e => set('making', e.target.value)} /></Field>
        <Field label="Stone / diamond value (₹)" hint="Added to the bill as it is"><Input disabled={dis} inputMode="decimal" value={f.stone} onChange={e => set('stone', e.target.value)} placeholder="0" /></Field>
        <Field label="HSN code" hint="Leave empty for 7113 (jewellery)"><Input disabled={dis} value={f.hsn} onChange={e => set('hsn', e.target.value)} maxLength={8} /></Field>
        {!id && canStock && <Field label={`Opening stock at ${branch?.name ?? 'this branch'}`} hint="How many pieces are in the shop now"><Input inputMode="numeric" value={f.openingQty} onChange={e => set('openingQty', e.target.value.replace(/\D/g, ''))} placeholder="0" /></Field>}

        <div className="sm:col-span-2">
          {err && <p className="mb-3 text-sm text-danger" role="alert">{err}</p>}
          {canWrite && <Button type="submit" variant="primary" disabled={!valid} busy={save.isPending}>{id ? 'Save changes' : 'Add product'}</Button>}
        </div>
      </form>

      {p && (
        <div className="mt-10 grid gap-8 sm:grid-cols-[200px_1fr]">
          <section>
            <h2 className="font-medium">QR tag</h2>
            {qr && <img src={qr} alt={`QR code for ${p.sku}`} className="mt-2 h-40 w-40 rounded border border-line bg-white p-1" />}
            <div className="mt-1 text-sm text-muted">{p.sku}</div>
            <Button className="mt-3" onClick={() => setTag(true)}>Print tag</Button>
          </section>
          <section>
            <h2 className="font-medium">Photos</h2>
            <div className="mt-2 flex flex-wrap gap-3">
              {p.images?.map((u: string) => (
                <div key={u} className="relative"><img src={u} alt="" className="h-24 w-24 rounded object-cover" />
                  {canWrite && <button onClick={() => removeImg.mutate(u)} aria-label="Remove photo" className="absolute right-1 top-1 rounded bg-black/70 px-1.5 text-xs text-white">✕</button>}</div>))}
              {canWrite && (p.images?.length ?? 0) < 8 && (
                <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded border border-dashed border-line text-center text-xs text-muted hover:border-gold">
                  {upload.isPending ? 'Uploading…' : 'Add photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = ''; }} /></label>)}
            </div>
            <h2 className="mt-6 font-medium">In stock</h2>
            <ul className="mt-2 text-sm">{(p.availability ?? []).length === 0 ? <li className="text-muted">Not in stock at any branch.</li>
              : p.availability.map((a: any) => <li key={a.branchId} className="flex justify-between border-b border-line py-1"><span>{branches?.find(b => b._id === a.branchId)?.name ?? 'Branch'}</span><span className="num">{a.qty}</span></li>)}</ul>
            {canWrite && <button className="mt-6 text-sm text-muted underline" onClick={() => { if (window.confirm(p.active === false ? 'Make this product active again?' : 'Hide this product from billing and the catalog?')) setActive.mutate(p.active === false); }}>
              {p.active === false ? 'Make active again' : 'Deactivate this product'}</button>}
          </section>
        </div>)}
      {tag && p && <TagDialog initial={[{ productId: p._id, name: p.name, sku: p.sku, copies: 1 }]} onClose={() => setTag(false)} />}
    </div>
  );
}
