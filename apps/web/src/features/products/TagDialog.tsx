import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useActiveBranch } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { inputCls } from '@/components/ui/Field';
import { TagLabelData, b64ToBytes, printBytesOverUsb, printLabelsInBrowser } from './tagPrint';

export interface TagItem { productId: string; name: string; sku: string; copies: number }

/** Print QR tags (40×25 or 50×25 mm) for one or many products. Used from the product list, the product page and the stock screens. */
export function TagDialog({ initial, onClose }: { initial: TagItem[]; onClose: () => void }) {
  const branch = useActiveBranch();
  const [items, setItems] = useState(initial), [method, setMethod] = useState<'browser' | 'usb'>('browser'), [msg, setMsg] = useState('');
  const hasUsb = typeof navigator !== 'undefined' && 'usb' in navigator;
  const setCopies = (id: string, n: number) => setItems(xs => xs.map(i => (i.productId === id ? { ...i, copies: Math.max(1, Math.min(50, n || 1)) } : i)));

  const print = useMutation({
    mutationFn: async (test: boolean) => {
      setMsg('');
      const r = test
        ? await api<any>('/print/tags/test', { body: { branchId: branch!._id } })
        : await api<any>('/print/tags', { body: { branchId: branch!._id, items: items.map(i => ({ productId: i.productId, copies: i.copies })) } });
      if (method === 'usb') { await printBytesOverUsb(b64ToBytes(r.bytesBase64)); return `Sent ${r.count} tag${r.count > 1 ? 's' : ''} to the printer.`; }
      await printLabelsInBrowser((r.labels as TagLabelData[]).map((label, n) => ({ label, copies: test ? 1 : items[n].copies })), r.tagSize);
      return 'The print dialog is open — choose the label printer.';
    },
    onSuccess: setMsg,
  });
  const total = items.reduce((s, i) => s + i.copies, 0);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Print tags">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-paper p-6">
        <h2 className="font-display text-xl">Print tags</h2>
        <p className="mt-1 text-sm text-muted">{branch?.printer ? `${branch.name}: ${branch.printer.tagSize.replace('x', '×')} mm labels · ${branch.printer.language ?? 'ESC/POS'}` : 'Each tag has the QR code, name, SKU, karat and weights.'}</p>
        <ul className="mt-4 divide-y divide-line">
          {items.map(i => (
            <li key={i.productId} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.name}</div><div className="text-xs text-muted">{i.sku}</div></div>
              <label className="text-sm text-muted">Copies <input type="number" min={1} max={50} value={i.copies} onChange={e => setCopies(i.productId, Number(e.target.value))} className={`${inputCls} num ml-1 !w-16`} /></label>
            </li>))}
        </ul>
        <fieldset className="mt-4 space-y-2 text-sm">
          <legend className="mb-1 font-medium">How to print</legend>
          <label className="flex gap-2"><input type="radio" checked={method === 'browser'} onChange={() => setMethod('browser')} /> <span><b>Browser print</b> — works with any label printer that has a driver installed</span></label>
          <label className={`flex gap-2 ${hasUsb ? '' : 'opacity-50'}`}><input type="radio" disabled={!hasUsb} checked={method === 'usb'} onChange={() => setMethod('usb')} /> <span><b>Direct USB</b> — sends the printer’s own language (Chrome/Edge). {hasUsb ? '' : 'Not available in this browser.'}</span></label>
        </fieldset>
        {(print.error || msg) && <p className={`mt-3 text-sm ${print.error ? 'text-danger' : 'text-ok'}`} role="status">{print.error ? (print.error as Error).message : msg}</p>}
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <Button onClick={() => print.mutate(true)} disabled={!branch} busy={print.isPending}>Print a test tag</Button>
          <div className="flex gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => print.mutate(false)} disabled={!branch || !items.length} busy={print.isPending}>Print {total} tag{total === 1 ? '' : 's'}</Button></div>
        </div>
      </div>
    </div>
  );
}
