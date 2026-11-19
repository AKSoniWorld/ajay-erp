import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DATA_STORES, OutboxOp, deviceId, deleteOp, kvGet, kvSet, nextProvisionalNo, outbox, putMany, putOp } from './db';
import { useSync } from './store';

const isNetworkError = (e: unknown) => e instanceof TypeError || !navigator.onLine;

// ---------------- pull: keep a copy of the shop's data on this device ----------------
async function pullCollection(c: (typeof DATA_STORES)[number], branchId?: string) {
  const key = `since:${c}${branchId ? ':' + branchId : ''}`;
  let since = await kvGet<string>(key);
  for (let page = 0; page < 200; page++) {
    const r = await api<{ items: any[]; hasMore: boolean; nextSince: string }>(`/sync/pull/${c}`, { query: { since, branchId, limit: 500 } });
    await putMany(c, r.items);
    since = r.nextSince; await kvSet(key, since);
    if (!r.hasMore) break;
  }
}
export async function pullAll(branchId: string | null) {
  await kvSet('branches', await api('/branches'));
  await kvSet('rates', (await api('/sync/pull/rates')).items[0]);
  for (const c of ['categories', 'products', 'customers', 'dairy'] as const) await pullCollection(c);
  if (branchId) await pullCollection('stock', branchId);
}

// ---------------- push: send queued bills, oldest first ----------------
export async function pushOutbox(): Promise<'done' | 'offline' | 'stopped'> {
  const todo = (await outbox()).filter(o => o.status === 'PENDING');
  const device = await deviceId();
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    for (const o of batch) await putOp({ ...o, status: 'SENDING' });
    try {
      const res = await api<{ results: any[] }>('/sync/push', { body: { deviceId: device, ops: batch.map(o => ({ clientUuid: o.clientUuid, type: o.type, payload: o.payload })) } });
      for (const r of res.results) {
        const o = batch.find(x => x.clientUuid === r.clientUuid); if (!o) continue;
        const { clientUuid, status, error, ...result } = r;
        await putOp({ ...o, status: status === 'PROCESSING' ? 'PENDING' : status, result, error });
      }
    } catch (e) {
      for (const o of batch) await putOp(o);                                  // back to waiting; nothing is lost
      if (!isNetworkError(e)) useSync.getState().set({ error: (e as Error).message });
      return isNetworkError(e) ? 'offline' : 'stopped';
    }
  }
  return 'done';
}

let running = false;
/** Send what is waiting, then refresh the local copy of the data. Safe to call any time. */
export async function syncNow() {
  if (running || !navigator.onLine || !useAuth.getState().user) return;
  running = true; useSync.getState().set({ syncing: true, error: null });
  try {
    const r = await pushOutbox();
    if (r !== 'offline') await pullAll(useAuth.getState().activeBranchId);
    useSync.getState().set({ lastSyncAt: Date.now() });
  } catch (e) { if (!isNetworkError(e)) useSync.getState().set({ error: e instanceof ApiError ? e.message : 'Sync failed' }); }
  finally {
    await pruneApplied(); running = false;
    useSync.getState().set({ syncing: false }); await useSync.getState().refresh();
  }
}
async function pruneApplied() {                                               // keep a week of finished items for reference
  const cutoff = Date.now() - 7 * 86_400_000;
  for (const o of await outbox()) if (o.status === 'APPLIED' && o.createdAt < cutoff) await deleteOp(o.clientUuid);
}

/** Queue an operation (a bill, a dairy payment). It is saved on this device first, then sent as soon as there is a connection. */
export async function enqueue(type: OutboxOp['type'], payload: Record<string, unknown>, meta: { label: string; amountPaise?: number; provisionalNo?: string }) {
  const op: OutboxOp = { clientUuid: crypto.randomUUID(), type, payload, createdAt: Date.now(), status: 'PENDING', ...meta };
  await putOp(op); await useSync.getState().refresh(); void syncNow();
  return op;
}
export { nextProvisionalNo };

/** Start background syncing: now, every minute, whenever the connection returns and when the app is brought back to the front. */
export function startSync() {
  void useSync.getState().refresh(); void syncNow();
  const t = window.setInterval(syncNow, 60_000), on = () => void syncNow(), vis = () => { if (!document.hidden) void syncNow(); };
  window.addEventListener('online', on); document.addEventListener('visibilitychange', vis);
  return () => { clearInterval(t); window.removeEventListener('online', on); document.removeEventListener('visibilitychange', vis); };
}
