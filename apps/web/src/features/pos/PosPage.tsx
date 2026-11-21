import { buildQuote } from '@ajay/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatINR, grams, rupeesToPaise } from '@/lib/format';
import { useActiveBranch, useOnline } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { PrintButton } from '@/components/ui/PrintPdf';
import { KeyHint } from '@/components/ui/Status';
import { applyLocalSale, loadPricing, localReady, localSchemes, rateMap } from '@/offline/local';
import { ReceiptData, printProvisional } from '@/offline/receipt';
import { enqueue, nextProvisionalNo } from '@/offline/sync';
import { AdvancePanel, DairyPanel, SchemeLite } from './AccountPanels';
import { CustomerPicker } from './CustomerPicker';
import { ExchangePanel } from './ExchangePanel';
import { ItemSearch } from './ItemSearch';
import { PaymentPanel, paise } from './PaymentPanel';
import { CartLine, CustomerLite, DEFAULT_PURITY, DairyRow, ExRow, PayRow, SearchItem, gradeLabel, num, toExchange } from './types';
import { useHotkeys } from './useHotkeys';

const freshPay = (): PayRow[] => [{ mode: 'CASH', text: '' }];
const newExRow = (): ExRow => ({ metal: 'GOLD', gross: '', less: '', purity: DEFAULT_PURITY.GOLD });
interface Done { id?: string; number: string; payable: number; due: number; provisional?: boolean; receipt?: ReceiptData }

export function PosPage() {
  const branch = useActiveBranch(), role = useAuth(s => s.user!.role), online = useOnline(), qc = useQueryClient();
  const [forceLocal, setForceLocal] = useState(false);          // the server could not be reached although the browser says online
  const local = !online || forceLocal;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [exRows, setExRows] = useState<ExRow[]>([]);
  const [dairyRows, setDairyRows] = useState<DairyRow[]>([]);
  const [advText, setAdvText] = useState('');
  const [discountText, setDiscountText] = useState('');
  const [taxMode, setTaxMode] = useState<'GST' | 'NON_GST'>('GST');
  const [pay, setPay] = useState<PayRow[]>(freshPay());
  const [allowDue, setAllowDue] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [notice, setNotice] = useState(''), [provPaper, setProvPaper] = useState<'' | 'A4' | 'A5'>('');
  const searchRef = useRef<HTMLInputElement>(null), customerRef = useRef<HTMLInputElement>(null), payRef = useRef<HTMLInputElement>(null);
  const exRef = useRef<HTMLInputElement>(null), dairyRef = useRef<HTMLInputElement>(null);
  const gst = taxMode === 'GST';
  const savedCustomer = !!customer && !customer.isNew;

  useEffect(() => { if (branch) setTaxMode(branch.gstRegistered === false ? 'NON_GST' : 'GST'); }, [branch?._id, branch?.gstRegistered]);
  useEffect(() => { if (online) setForceLocal(false); }, [online]);
  useEffect(() => { if (local) setAdvText(''); }, [local]);       // advance balances are only known online

  // ---- what this customer has with us: dairy schemes and advance ----
  const account = useQuery({ queryKey: ['cust-account', customer?._id], queryFn: () => api(`/customers/${customer!._id}/account`), enabled: savedCustomer && !local });
  const offlineSchemes = useQuery({ queryKey: ['local-schemes', customer?._id], queryFn: () => localSchemes(customer!._id), enabled: savedCustomer && local });
  const schemes: SchemeLite[] = useMemo(() => local ? (offlineSchemes.data ?? [])
    : (account.data?.dairy?.schemes ?? []).filter((s: any) => s.canRedeem && s.balancePaise > 0), [local, offlineSchemes.data, account.data]);
  const advanceBal: number = local ? 0 : account.data?.advance?.balancePaise ?? 0;

  // ---- request body: only complete, valid rows are sent ----
  const exchangesBody = useMemo(() => exRows.map(toExchange).filter(Boolean) as any[], [exRows]);
  const dairyBody = useMemo(() => dairyRows.flatMap(r => {
    const s = schemes.find(x => x.schemeId === r.schemeId), amt = rupeesToPaise(num(r.text));
    if (!s || amt <= 0 || (s.forfeitsBonusIfUsed && !r.confirm)) return [];          // a bonus scheme needs the cashier's tick first
    return [{ schemeId: r.schemeId, amountPaise: amt, ...(s.forfeitsBonusIfUsed && { confirmForfeitBonus: true }) }];
  }), [dairyRows, schemes]);
  const advanceReq = Math.min(rupeesToPaise(num(advText)), advanceBal);
  const discountReq = rupeesToPaise(Math.max(0, num(discountText)));
  const body = useMemo(() => (branch && cart.length ? {
    branchId: branch._id, ...(savedCustomer && { customerId: customer!._id }), lines: cart.map(l => ({ productId: l.productId, qty: l.qty })),
    ...(exchangesBody.length && { exchanges: exchangesBody }), ...(dairyBody.length && { dairy: dairyBody }), ...(advanceReq > 0 && { advancePaise: advanceReq }), ...(discountReq > 0 && { discountPaise: discountReq }), taxMode,
  } : null), [branch, cart, customer, savedCustomer, exchangesBody, dairyBody, advanceReq, discountReq, taxMode]);

  // ---- pricing: the server when connected (authoritative); the same rules run on this device when offline ----
  const serverQuote = useQuery({ queryKey: ['pos-quote', body], queryFn: () => api('/pos/quote', { body }), enabled: !!body && !local, retry: false, placeholderData: keepPreviousData });
  useEffect(() => { if (serverQuote.error instanceof TypeError) setForceLocal(true); }, [serverQuote.error]);
  const pricing = useQuery({ queryKey: ['local-pricing', local], queryFn: loadPricing, enabled: local, staleTime: 0, gcTime: 0 });
  const ready = useQuery({ queryKey: ['local-ready', local], queryFn: localReady, enabled: local, staleTime: 0 });
  const localQuote = useMemo(() => {
    if (!local || !body || !pricing.data) return null;
    try {
      const total = dairyBody.reduce((s, d) => s + d.amountPaise, 0);
      const available = dairyBody.reduce((s, d) => s + (schemes.find(x => x.schemeId === d.schemeId)?.balancePaise ?? 0), 0);
      return { data: buildQuote({ products: pricing.data.products, saleRates: rateMap(pricing.data.rates, 'SALE'), exchangeRates: rateMap(pricing.data.rates, 'EXCHANGE'),
        lines: body.lines, exchanges: exchangesBody, dairyAdjustment: total, dairyAvailable: available, discountPaise: discountReq, taxMode }), error: null as Error | null };
    } catch (e) { return { data: undefined, error: e as Error }; }
  }, [local, body, pricing.data, dairyBody, schemes, exchangesBody, taxMode, discountReq]);
  const qData: any = local ? localQuote?.data : serverQuote.data;
  const qError: Error | null = local ? localQuote?.error ?? null : serverQuote.isError && !(serverQuote.error instanceof TypeError) ? (serverQuote.error as Error) : null;
  const qBusy = local ? pricing.isLoading : serverQuote.isFetching;

  const t = body ? qData?.totals : undefined, payable: number = t?.finalPayable ?? 0;
  const advanceUsed = t && advanceReq > 0 ? advanceReq : 0, toCollect = Math.max(payable - advanceUsed, 0);
  const lineAmount = (id: string) => { const l = qData?.lines?.find((x: any) => String(x.productId) === id); return l ? l.metalValue + l.stoneValue + l.making : null; };

  useEffect(() => { setPay(p => (p.length === 1 ? [{ ...p[0], text: toCollect ? (toCollect / 100).toFixed(2) : '' }] : p)); }, [toCollect]);

  const paid = pay.reduce((s, r) => s + paise(r), 0), left = toCollect - paid;
  const canLeaveDue = role !== 'STAFF' && left > 0;
  const canFinish = !!branch && cart.length > 0 && !!customer && !!t && !qBusy && !qError && (left === 0 || (allowDue && canLeaveDue));

  // ---- cart ----
  const add = (i: SearchItem) => {
    setNotice('');
    if (i.qty <= 0) return setNotice(`${i.name} is out of stock at this branch.`);
    setCart(c => {
      const ex = c.find(l => l.productId === i._id);
      if (!ex) return [...c, { productId: i._id, name: i.name, sku: i.sku, karat: i.karat, metal: i.metal, netMg: i.netMg, qty: 1, stock: i.qty }];
      if (ex.qty >= ex.stock) { setNotice(`Only ${ex.stock} of ${i.name} in stock.`); return c; }
      return c.map(l => (l.productId === i._id ? { ...l, qty: l.qty + 1 } : l));
    });
  };
  const setQty = (id: string, d: number) => setCart(c => c.flatMap(l => l.productId !== id ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: Math.min(l.qty + d, l.stock) }]));
  const chooseCustomer = (c: CustomerLite | null) => { setCustomer(c); setDairyRows([]); setAdvText(''); };   // balances belong to one customer

  // ---- finish ----
  const viaQueue = local || !!customer?.isNew;            // offline, or a customer made offline: save on the device, the server finishes it
  const finish = useMutation({
    mutationFn: async (): Promise<Done> => {
      const lines = cart.map(l => ({ productId: l.productId, qty: l.qty }));
      const payments = pay.map(r => ({ mode: r.mode, amountPaise: paise(r) })).filter(p => p.amountPaise > 0);
      if (viaQueue) {
        const provisionalNo = await nextProvisionalNo(), due = allowDue && canLeaveDue ? left : 0;
        await enqueue('SALE', {
          branchId: branch!._id, ...(customer!.isNew ? { customer: { name: customer!.name, mobile: customer!.mobile } } : { customerId: customer!._id }),
          lines, ...(exchangesBody.length && { exchanges: exchangesBody }), ...(dairyBody.length && { dairy: dairyBody }), ...(discountReq > 0 && { discountPaise: discountReq }), taxMode,
          payments, ...(due > 0 && { allowDue: true }), clientTotals: { finalPayable: payable }, offlineAt: new Date().toISOString(), provisionalNo,
        }, { label: `${customer!.name} · ${cart.length} item${cart.length > 1 ? 's' : ''}`, amountPaise: payable, provisionalNo });
        await applyLocalSale(branch!._id, cart, dairyBody);
        qc.invalidateQueries({ queryKey: ['pos-search'] });
        const fine = (m: string) => (qData.exchanges as any[]).filter(e => e.metal === m).reduce((s, e) => s + e.fineMg, 0);
        const showFine = branch!.exchangeDisplay === 'AMOUNT_AND_FINE_WEIGHT';
        return { provisional: true, number: provisionalNo, payable, due, receipt: {
          branchName: branch!.name, branchAddress: branch!.address, provisionalNo, at: new Date(), customer: { name: customer!.name, mobile: customer!.mobile },
          lines: cart.map(l => ({ name: l.name, qty: l.qty, amountPaise: lineAmount(l.productId) ?? 0 })), totals: t, gst, payments, duePaise: due,
          ...(showFine && { fineGoldMg: fine('GOLD'), fineSilverMg: fine('SILVER') }) } };
      }
      const extra = { exchanges: exchangesBody, dairy: dairyBody, advancePaise: advanceReq, discountPaise: discountReq, taxMode };
      let id = draftId;
      if (id) await api(`/pos/invoices/${id}`, { method: 'PATCH', body: { customerId: customer!._id, lines, ...extra } });
      else { const d = await api('/pos/invoices', { body: { branchId: branch!._id, customerId: customer!._id, lines, ...extra } }); id = d._id as string; setDraftId(id); }
      const inv = await api(`/pos/invoices/${id}/finalize`, { body: { payments, ...(allowDue && canLeaveDue && { allowDue: true }) } });
      return { id: inv._id, number: inv.number, payable: inv.totals.finalPayable, due: inv.duePaise ?? 0 };
    },
    onSuccess: r => setDone(r),
    onError: e => { if (e instanceof TypeError) setForceLocal(true); },          // connection dropped: the next Finish saves on the device
  });
  const finishError = finish.error instanceof TypeError ? 'No connection to the server. Press Finish again — the bill will be saved on this device and sent later.' : (finish.error as Error | null)?.message;

  const reset = () => {
    setCart([]); setCustomer(null); setExRows([]); setDairyRows([]); setAdvText(''); setDiscountText(''); setTaxMode(branch?.gstRegistered === false ? 'NON_GST' : 'GST'); setPay(freshPay()); setAllowDue(false);
    setDraftId(null); setDone(null); setNotice(''); finish.reset(); setTimeout(() => searchRef.current?.focus(), 0);
  };

  const keys = useMemo(() => ({
    F2: () => searchRef.current?.focus(),
    F3: () => { chooseCustomer(null); setTimeout(() => customerRef.current?.focus(), 0); },
    F4: () => { if (!exRows.length) setExRows([newExRow()]); setTimeout(() => exRef.current?.focus(), 0); },
    F5: () => dairyRef.current?.focus(),
    F8: () => payRef.current?.focus(),
    F9: () => { if (canFinish && !finish.isPending) finish.mutate(); },
  }), [canFinish, finish, exRows.length]);
  useHotkeys(done ? {} : keys);
  useEffect(() => {                                           // Enter starts the next bill once this one is saved
    if (!done) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); reset(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [done]);                                                 // eslint-disable-line react-hooks/exhaustive-deps

  if (!branch) return <div className="p-6 text-sm text-muted">Choose a branch to start billing.</div>;

  return (
    <div className="flex h-full flex-col">
      {local && (
        <div className="border-b border-warn bg-gold-wash px-4 py-2 text-sm text-warn" role="status">
          {ready.data === false
            ? 'This device has not downloaded the catalog yet. Connect to the internet once to use it offline.'
            : 'Working offline — bills are saved on this device and sent when the internet is back.'}
          {forceLocal && online && <button className="ml-3 underline" onClick={() => setForceLocal(false)}>Try online again</button>}
        </div>)}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
        {/* find */}
        <section className="flex min-h-0 flex-col border-b border-line p-4 lg:border-b-0 lg:border-r">
          <ItemSearch ref={searchRef} branchId={branch._id} onPick={add} offline={local} />
          {notice && <p className="mt-2 text-sm text-warn" role="status">{notice}</p>}
        </section>

        {/* the bill */}
        <section className="min-h-0 overflow-y-auto border-b border-line p-4 lg:border-b-0 lg:border-r">
          <CustomerPicker ref={customerRef} value={customer} onChange={chooseCustomer} offline={local} />
          <div className="mt-5">
            {cart.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line p-8 text-center text-muted">
                <p className="font-display text-xl text-ink">Start the bill</p>
                <p className="mt-1 text-sm">Scan the QR on a tag or search for an item on the left.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-muted"><th className="py-2 font-medium">Item</th><th className="py-2 text-center font-medium">Qty</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
                <tbody>{cart.map(l => (
                  <tr key={l.productId} className="border-b border-line align-top">
                    <td className="py-3 pr-2"><div className="font-medium">{l.name}</div><div className="text-xs text-muted">{l.sku} · {gradeLabel(l)} · net {grams(l.netMg)}</div></td>
                    <td className="py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button aria-label={`Less ${l.name}`} onClick={() => setQty(l.productId, -1)} className="h-8 w-8 rounded border border-line hover:border-gold">−</button>
                        <span className="num w-8 text-center">{l.qty}</span>
                        <button aria-label={`More ${l.name}`} onClick={() => setQty(l.productId, 1)} disabled={l.qty >= l.stock} className="h-8 w-8 rounded border border-line hover:border-gold disabled:opacity-40">+</button>
                      </div>
                    </td>
                    <td className="py-3 text-right"><Money paise={lineAmount(l.productId)} strong /></td>
                  </tr>))}
                </tbody>
              </table>)}
            {qError && (
              <p className="mt-4 rounded border border-danger p-3 text-sm text-danger" role="alert">
                {qError.message} {/rate not set/i.test(qError.message) && role === 'ADMIN' && <Link to="/rates" className="underline">Set the rate</Link>}
              </p>)}
          </div>

          <div className="mt-6 space-y-6">
            <ExchangePanel rows={exRows} onChange={setExRows} priced={qData?.exchanges} firstRef={exRef} />
            {customer && schemes.length > 0 && <DairyPanel schemes={schemes} rows={dairyRows} onChange={setDairyRows} firstRef={dairyRef} />}
            {customer && advanceBal > 0 && <AdvancePanel balance={advanceBal} text={advText} onChange={setAdvText} max={payable || advanceBal} />}
            {customer && local && <p className="text-xs text-muted">Advance balances are not available offline.</p>}
          </div>
        </section>

        {/* totals and payment */}
        <section className="flex min-h-0 flex-col overflow-y-auto p-4">
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTaxMode('GST')} className={`rounded-md border px-3 py-2 text-sm font-medium ${gst ? 'border-gold text-gold-deep' : 'border-line bg-surface text-muted'}`}>
              GST BILL
            </button>
            <button type="button" onClick={() => setTaxMode('NON_GST')} className={`rounded-md border px-3 py-2 text-sm font-medium ${!gst ? 'border-gold text-gold-deep' : 'border-line bg-surface text-muted'}`}>
              WITHOUT GST
            </button>
          </div>
          <div className="mt-1 text-xs text-muted">{gst ? 'GST will be calculated and GSTIN printed.' : 'No GST will be charged; Bill of Supply.'}{local ? ' � price worked out on this device' : ''}</div>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">Fixed discount (₹)</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={discountText}
              onChange={e => setDiscountText(e.target.value)}
              placeholder="Enter discount in rupees"
              className="w-full rounded-md border border-line bg-surface px-3 py-2"
            />
          </label>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Jewellery" v={t ? t.jewellery : null} />
            <Row k="Making charges" v={t ? t.making : null} />
            {discountReq > 0 && <Row k="Discount" v={-discountReq} />}
            {gst && <Row k="GST" v={t ? t.gst : null} />}
            {t && t.goldExchange > 0 && <Row k="Old gold" v={-t.goldExchange} />}
            {t && t.silverExchange > 0 && <Row k="Old silver" v={-t.silverExchange} />}
            {t && t.dairy > 0 && <Row k="Dairy savings" v={-t.dairy} />}
            {t && t.roundOff !== 0 && <Row k="Round off" v={t.roundOff} />}
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-medium">Net payable</span>
            <span className="font-display text-3xl text-gold-deep">{t ? formatINR(payable) : '—'}</span>
          </div>
          {advanceUsed > 0 && (
            <dl className="mt-2 space-y-1 text-sm">
              <Row k="Advance used" v={-advanceUsed} />
              <div className="flex justify-between font-medium"><dt>To collect</dt><dd><Money paise={toCollect} strong /></dd></div>
            </dl>)}

          <div className="mt-6"><PaymentPanel rows={pay} onChange={setPay} payable={toCollect} firstRef={payRef} /></div>
          {canLeaveDue && (
            <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={allowDue} onChange={e => setAllowDue(e.target.checked)} />
              Leave {formatINR(left)} as customer due</label>)}

          <div className="mt-auto pt-6">
            {!customer && cart.length > 0 && <p className="mb-2 text-sm text-muted">Choose the customer to finish the bill.</p>}
            {finishError && <p className="mb-2 text-sm text-danger" role="alert">{finishError}</p>}
            <Button variant="primary" className="w-full py-3 text-base" disabled={!canFinish} busy={finish.isPending} onClick={() => finish.mutate()}>
              {viaQueue ? 'Save bill on this device' : 'Finish bill'} <KeyHint k="F9" />
            </Button>
          </div>
        </section>
      </div>

      {done && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Bill saved">
          <div className="w-full max-w-sm rounded-lg border border-gold bg-paper p-6 text-center">
            <p className="text-sm text-muted">{done.provisional ? 'Saved on this device — it will be sent when the internet is back' : 'Bill saved'}</p>
            <p className="mt-1 font-display text-2xl">{done.number}</p>
            {done.provisional && <p className="text-xs text-muted">Provisional number — the official one is issued when it is sent</p>}
            <p className="mt-2 text-3xl font-semibold text-gold-deep">{formatINR(done.payable)}</p>
            {done.due > 0 && <p className="mt-1 text-sm text-warn">{formatINR(done.due)} left as customer due</p>}
            <div className="mt-6 flex flex-col gap-2">
              {done.provisional
                ? <div className="flex items-stretch gap-1"><Button variant="primary" className="flex-1" onClick={() => printProvisional(done.receipt!, provPaper || branch.receiptPaper || 'A5')}>Print provisional receipt</Button>
                    <select aria-label="Paper size" value={provPaper || branch.receiptPaper || 'A5'} onChange={e => setProvPaper(e.target.value as 'A4' | 'A5')} className="rounded border border-line bg-paper px-2 text-sm text-ink"><option value="A4">A4</option><option value="A5">A5</option></select></div>
                : <PrintButton kind="invoice" path={`/pos/invoices/${done.id}/pdf`} />}
              <Button onClick={reset} autoFocus>New bill <KeyHint k="Enter" /></Button>
            </div>
          </div>
        </div>)}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: number | null }) => (
  <div className="flex justify-between"><dt className="text-muted">{k}</dt><dd><Money paise={v} /></dd></div>
);
