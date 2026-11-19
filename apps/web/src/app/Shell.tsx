import { LogOut } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SyncPill } from '@/features/sync/SyncPill';
import { startSync } from '@/offline/sync';
import { RateStrip } from '@/features/rates/RateStrip';
import { useAuth } from '@/lib/auth';
import { useActiveBranch, useBranches } from '@/lib/hooks';
import { NAV, canSee, visibleNav } from '@/lib/nav';

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded px-3 py-2 text-sm ${isActive ? 'bg-gold-wash font-medium text-gold-deep' : 'hover:bg-gold-wash'}`;

export function Shell() {
  const { user, logout, setBranch } = useAuth(), nav = useNavigate(), loc = useLocation();
  const { data: branches } = useBranches(), branch = useActiveBranch();
  useEffect(() => (user ? startSync() : undefined), [user?.id]);   // keep the local copy fresh and send waiting bills
  if (!user) return null;
  const counter = loc.pathname.startsWith('/pos');                        // the till is dark, everything else is bright
  const groups = visibleNav(user.role);
  const here = NAV.flatMap(g => g.items).filter(i => i.to !== '/').find(i => loc.pathname.startsWith(i.to));
  const allowed = !here || canSee(here, user.role);

  return (
    <div className={`${counter ? 'counter' : ''} flex h-full flex-col bg-canvas text-ink`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-paper px-4 py-2">
        <span className="font-display text-lg">Ajay Jewellers</span>
        <div className="min-w-0 flex-1"><RateStrip /></div>
        {branches && branches.length > 1 && (
          <select aria-label="Branch" value={branch?._id} onChange={e => setBranch(e.target.value)} className="rounded border border-line bg-paper px-2 py-1 text-sm">
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>)}
        <SyncPill />
        <span className="hidden text-sm text-muted sm:inline">{user.name}</span>
        <button onClick={() => { logout(); nav('/login'); }} className="rounded p-2 hover:bg-gold-wash" title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main" className="hidden w-56 shrink-0 overflow-y-auto border-r border-line bg-paper p-3 md:block">
          {groups.map(g => (
            <div key={g.title} className="mb-4">
              <div className="mb-1 px-3 text-xs text-muted">{g.title}</div>
              {g.items.map(i => (
                <NavLink key={i.to} to={i.to} end={i.to === '/'} className={linkCls}>
                  <i.icon size={16} /><span className="flex-1">{i.label}</span>{i.hint && <span className="text-[11px] text-muted">{i.hint}</span>}
                </NavLink>))}
            </div>))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <nav aria-label="Main (mobile)" className="flex gap-1 overflow-x-auto border-b border-line bg-paper p-2 md:hidden">
            {groups.flatMap(g => g.items).map(i => <NavLink key={i.to} to={i.to} end={i.to === '/'} className={linkCls}><i.icon size={16} />{i.label}</NavLink>)}
          </nav>
          <main className="min-h-0 flex-1 overflow-y-auto">
            {allowed ? <Outlet /> : <div className="p-6"><h1 className="font-display text-2xl">Not available</h1><p className="mt-2 text-sm text-muted">Your role does not have access to this screen.</p></div>}
          </main>
        </div>
      </div>
    </div>
  );
}
