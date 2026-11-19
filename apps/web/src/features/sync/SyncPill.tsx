import { Link } from 'react-router-dom';
import { useOnline } from '@/lib/hooks';
import { useSync } from '@/offline/store';

/** Online / offline, and how many bills are waiting, need a decision or failed. Opens the Sync screen. */
export function SyncPill() {
  const on = useOnline(), { counts, syncing, lastSyncAt, error } = useSync();
  const tip = !on ? 'No internet — bills are kept on this device and sent later' : error ? error : lastSyncAt ? `Last synced ${new Date(lastSyncAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Connected';
  return (
    <Link to="/sync" title={tip} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${on ? 'border-line text-muted' : 'border-warn text-warn'}`}>
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-ok' : 'bg-warn'}`} />{on ? (syncing ? 'Syncing…' : 'Online') : 'Offline'}
      {counts.pending > 0 && <span className="rounded bg-gold-wash px-1.5 text-gold-deep">{counts.pending} waiting</span>}
      {counts.review > 0 && <span className="rounded bg-gold-wash px-1.5 text-warn">{counts.review} to review</span>}
      {counts.failed > 0 && <span className="rounded bg-gold-wash px-1.5 text-danger">{counts.failed} failed</span>}
    </Link>
  );
}
