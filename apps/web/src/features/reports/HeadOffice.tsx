import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatINR, grams } from '@/lib/format';
import { Money } from '@/components/ui/Money';

const Tile = ({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) => (
  <div className="rounded-lg border border-line bg-paper p-4"><div className="text-sm text-muted">{label}</div><div className="mt-1 text-2xl font-semibold">{children}</div>{sub && <div className="mt-1 text-xs text-muted">{sub}</div>}</div>);
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="mt-8"><h2 className="font-display text-xl">{title}</h2>{children}</section>;
const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => (
  <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-paper"><table className="w-full text-sm">
    <thead><tr className="border-b border-line text-left text-muted">{head.map((h, i) => <th key={h} className={`p-3 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, n) => <tr key={n} className="border-b border-line last:border-0">{r.map((c, i) => <td key={i} className={`p-3 ${i ? 'text-right' : ''}`}>{c}</td>)}</tr>)}</tbody></table></div>);

/** The owner's view of the whole business for a period: sales, stock, dairy, old metal and what is owed. */
export function HeadOffice({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['ho-overview', from, to], queryFn: () => api('/dashboard/head-office', { query: { from, to } }) });
  if (q.isLoading) return <p className="mt-6 text-sm text-muted">Working it out…</p>;
  if (q.isError) return <p className="mt-6 text-sm text-danger">{(q.error as Error).message}</p>;
  const d = q.data, p = d.sales.period, td = d.sales.today.total;
  return (
    <div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Net sales (period)" sub={`${p.total.invoices} bills · returns ${formatINR(p.total.returnsPaise, { decimals: false })}`}><Money paise={p.total.netPaise} decimals={false} /></Tile>
        <Tile label="GST charged"><Money paise={p.total.gstPaise} decimals={false} /></Tile>
        <Tile label="Net sales today" sub={`${td.invoices} bills`}><Money paise={td.netPaise} decimals={false} /></Tile>
        <Tile label="Old metal taken" sub={`${grams(d.exchange.goldFineMg)} fine gold · ${grams(d.exchange.silverFineMg)} fine silver`}><Money paise={d.exchange.valuePaise} decimals={false} /></Tile>
      </div>

      <Section title="Sales by branch">
        <Table head={['Branch', 'Bills', 'Sales', 'Returns', 'Net']} rows={p.byBranch.map((b: any) => [b.branch, b.invoices, <Money paise={b.salesPaise} />, <Money paise={b.returnsPaise} />, <Money paise={b.netPaise} strong />])} />
        <p className="mt-2 text-sm text-muted">GST invoices net {formatINR(p.byTaxMode.GST.netPaise, { decimals: false })} · bills of supply (no GST) net {formatINR(p.byTaxMode.NON_GST.netPaise, { decimals: false })}</p>
      </Section>

      <Section title="Stock">
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Tile label="Pieces in stock">{d.stock.totalPieces}</Tile><Tile label="Moving between branches" sub={`${d.stock.inTransit.transfers} transfers`}>{d.stock.inTransit.pieces}</Tile>
          <Tile label="Items below zero" sub="oversold while offline">{d.stock.byBranch.reduce((s: number, b: any) => s + b.negative, 0)}</Tile>
        </div>
        <Table head={['Branch', 'Pieces', 'Different items', 'Below zero']} rows={d.stock.byBranch.map((b: any) => [b.branch, b.pieces, b.products, b.negative > 0 ? <span className="text-danger">{b.negative}</span> : 0])} />
        {d.stock.rawMetal.length > 0 && <Table head={['Old metal on hand', 'Net', 'Fine']} rows={d.stock.rawMetal.map((m: any) => [`${m.branch} · ${m.metal === 'GOLD' ? 'Gold' : 'Silver'}`, grams(m.netMg), grams(m.fineMg)])} />}
      </Section>

      <Section title="Dairy savings">
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <Tile label="Schemes" sub={`${d.dairy.schemes.byStatus.ACTIVE ?? 0} running · ${d.dairy.schemes.byStatus.COMPLETED ?? 0} complete · ${d.dairy.schemes.byStatus.MATURED_SHORTFALL ?? 0} past end`}>{d.dairy.schemes.total}</Tile>
          <Tile label="Held for customers"><Money paise={d.dairy.balancePaise} decimals={false} /></Tile>
          <Tile label="Collected (period)"><Money paise={d.dairy.collected.totalPaise} decimals={false} /></Tile>
          <Tile label="Instalments missed">{d.dairy.missedInstalments}</Tile>
        </div>
      </Section>

      <Section title="Owed to and by us">
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <Tile label="Customers owe us"><Money paise={d.accounts.customerDuePaise} decimals={false} /></Tile>
          <Tile label="Customer advances held"><Money paise={d.accounts.customerAdvancePaise} decimals={false} /></Tile>
          <Tile label="We owe suppliers (cash)"><Money paise={d.accounts.supplierPayable.cashPaise} decimals={false} /></Tile>
          <Tile label="We owe suppliers (fine metal)" sub={`${grams(d.accounts.supplierPayable.silverFineMg)} silver`}>{grams(d.accounts.supplierPayable.goldFineMg)} gold</Tile>
        </div>
      </Section>
    </div>);
}
