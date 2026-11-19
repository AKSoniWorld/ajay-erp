import { useQuery } from '@tanstack/react-query';
import { ScanLine } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { grams } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { KeyHint } from '@/components/ui/Status';
import { localByCode, localSearch } from '@/offline/local';
import { QrScanDialog } from './QrScanDialog';
import { SearchItem, gradeLabel } from './types';

/** Looks like scanned QR text or a typed SKU: AJ:G-000123 or G-000123. A handheld QR scanner types it and presses Enter. */
const looksLikeCode = (s: string) => /^(AJ:)?[A-Z]-\d{4,}$/i.test(s.trim());
const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export const ItemSearch = forwardRef<HTMLInputElement, { branchId: string; onPick: (i: SearchItem) => void; offline?: boolean }>(({ branchId, onPick, offline }, ref) => {
  const [q, setQ] = useState(''), [debounced, setDebounced] = useState(''), [active, setActive] = useState(0), [err, setErr] = useState(''), [scanning, setScanning] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 180); return () => clearTimeout(t); }, [q]);
  const results = useQuery({
    queryKey: ['pos-search', branchId, debounced, !!offline],
    queryFn: () => (offline ? localSearch(branchId, debounced) : api<SearchItem[]>('/pos/search', { query: { branchId, q: debounced } })),
    enabled: debounced.length >= 2 && !looksLikeCode(debounced),
  });
  const items = results.data ?? [];
  useEffect(() => setActive(0), [debounced]);

  const pick = (i: SearchItem) => { setErr(''); onPick(i); setQ(''); };
  const byCode = async (code: string) => {
    setErr('');
    try { const r = offline ? await localByCode(branchId, code) : await api<SearchItem[]>('/pos/search', { query: { branchId, code: code.trim() } }); pick(r[0]); }
    catch { setErr(`No item for “${code.trim()}”`); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Escape') setQ('');
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (looksLikeCode(q)) byCode(q); else if (items[active]) pick(items[active]);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <label className="mb-2 flex items-center justify-between text-sm font-medium">Find an item <KeyHint k="F2" /></label>
      <input ref={ref} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} autoFocus aria-label="Find an item"
        placeholder="Scan the QR on a tag, or type a name or SKU" className="w-full rounded border border-line bg-paper px-3 py-3 text-base placeholder:text-muted focus:border-gold" />
      {hasCamera && <Button className="mt-2 self-start" onClick={() => setScanning(true)}><ScanLine size={16} /> Scan with camera</Button>}
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
      <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto" role="listbox">
        {items.map((i, n) => (
          <li key={i._id}>
            <button role="option" aria-selected={n === active} onClick={() => pick(i)} onMouseEnter={() => setActive(n)}
              className={`flex w-full items-center gap-3 rounded border px-3 py-2 text-left ${n === active ? 'border-gold bg-gold-wash' : 'border-line bg-paper'} ${i.qty <= 0 ? 'opacity-60' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.name}</span>
                <span className="block text-xs text-muted">{i.sku} · {gradeLabel(i)} · net {grams(i.netMg)}</span>
              </span>
              <span className={`text-xs ${i.qty > 0 ? 'text-muted' : 'text-danger'}`}>{i.qty > 0 ? `${i.qty} in stock` : 'Out of stock'}</span>
            </button>
          </li>))}
        {debounced.length >= 2 && !looksLikeCode(debounced) && !results.isFetching && items.length === 0 && <li className="px-1 text-sm text-muted">Nothing found for “{debounced}”.</li>}
      </ul>
      {scanning && <QrScanDialog onClose={() => setScanning(false)} onResult={text => { setScanning(false); byCode(text); }} />}
    </div>
  );
});
ItemSearch.displayName = 'ItemSearch';
