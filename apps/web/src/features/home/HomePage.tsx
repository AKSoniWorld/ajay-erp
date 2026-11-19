import { hasPermission } from '@ajay/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { todayIST } from '@/lib/format';
import { Money } from '@/components/ui/Money';
import { useActiveBranch } from '@/lib/hooks';

const Tile = ({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) => (
  <div className="rounded-lg border border-line bg-paper p-4">
    <div className="text-sm text-muted">{label}</div>
    <div className="mt-1 text-2xl font-semibold">{children}</div>
    {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
  </div>
);

export function HomePage() {
  const user = useAuth(s => s.user)!, branch = useActiveBranch();
  const today = todayIST(), isAdmin = user.role === 'ADMIN', internal = user.role !== 'STAFF';
  const sales = useQuery({ queryKey: ['sales-today', today], queryFn: () => api('/reports/sales', { query: { from: today, to: today } }), enabled: hasPermission(user.role, 'report.view') });
  const ho = useQuery({ queryKey: ['ho', today], queryFn: () => api('/dashboard/head-office', { query: { from: today, to: today } }), enabled: isAdmin });
  const t = sales.data?.totals;
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="font-display text-2xl">Good day, {user.name.split(' ')[0]}</h1>
      <p className="mt-1 text-sm text-muted">{isAdmin ? 'All branches' : branch ? branch.name : ''} · {user.role === 'STAFF' ? 'your sales today' : 'today'}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Bills">{sales.isLoading ? '…' : t?.invoices ?? 0}</Tile>
        <Tile label="Net sales" sub="after returns"><Money paise={t?.netPaise ?? 0} decimals={false} /></Tile>
        {internal && <Tile label="GST collected"><Money paise={t?.gstPaise ?? 0} decimals={false} /></Tile>}
        {internal && <Tile label="Old metal taken"><Money paise={t?.exchangePaise ?? 0} decimals={false} /></Tile>}
      </div>

      {isAdmin && ho.data && (
        <section className="mt-8">
          <h2 className="font-display text-xl">Across the business</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Pieces in stock" sub={`${ho.data.stock.inTransit.pieces} in transit`}>{ho.data.stock.totalPieces}</Tile>
            <Tile label="Dairy collected today"><Money paise={ho.data.dairy.collected.totalPaise} decimals={false} /></Tile>
            <Tile label="Customers owe us"><Money paise={ho.data.accounts.customerDuePaise} decimals={false} /></Tile>
            <Tile label="We owe suppliers (cash)"><Money paise={ho.data.accounts.supplierPayable.cashPaise} decimals={false} /></Tile>
          </div>
          {ho.data.sales.period.byBranch.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-paper">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Branch</th><th className="p-3 text-right font-medium">Bills</th><th className="p-3 text-right font-medium">Net sales</th></tr></thead>
                <tbody>{ho.data.sales.period.byBranch.map((b: any) => (
                  <tr key={b.branchId} className="border-b border-line last:border-0"><td className="p-3">{b.branch}</td><td className="p-3 text-right num">{b.invoices}</td><td className="p-3 text-right"><Money paise={b.netPaise} /></td></tr>))}
                </tbody>
              </table>
            </div>)}
        </section>)}

      {hasPermission(user.role, 'invoice.create') && (
        <div className="mt-8"><Link to="/pos" className="inline-flex items-center gap-2 rounded bg-gold px-5 py-3 font-semibold text-[#17130a] hover:brightness-95">Start a new bill</Link></div>)}
    </div>
  );
}
