import { IDBPDatabase, openDB } from 'idb';

/** Everything the till needs to keep selling without internet lives here (IndexedDB), plus the queue of bills waiting to be sent. */
export type OpStatus = 'PENDING' | 'SENDING' | 'APPLIED' | 'NEEDS_REVIEW' | 'FAILED';
export interface OutboxOp {
  clientUuid: string; type: 'SALE' | 'DAIRY_PAYMENT'; payload: Record<string, unknown>;
  createdAt: number; status: OpStatus; label: string; amountPaise?: number; provisionalNo?: string;
  result?: Record<string, any>; error?: string;
}
export const DATA_STORES = ['products', 'categories', 'customers', 'stock', 'dairy'] as const;

let handle: Promise<IDBPDatabase<any>> | null = null;
export const db = () => (handle ??= openDB('ajay-pos', 1, {
  upgrade(d) {
    d.createObjectStore('kv');
    for (const n of DATA_STORES) d.createObjectStore(n, { keyPath: '_id' });
    d.createObjectStore('outbox', { keyPath: 'clientUuid' }).createIndex('createdAt', 'createdAt');
  },
}));

export const kvGet = async <T = any>(k: string) => (await db()).get('kv', k) as Promise<T | undefined>;
export const kvSet = async (k: string, v: unknown) => { await (await db()).put('kv', v, k); };
export const getAll = async <T = any>(store: string) => (await db()).getAll(store) as Promise<T[]>;
export async function putMany(store: string, items: any[]) {
  if (!items.length) return;
  const tx = (await db()).transaction(store, 'readwrite');
  await Promise.all([...items.map(i => tx.store.put(i)), tx.done]);
}
export const outbox = async () => (await (await db()).getAllFromIndex('outbox', 'createdAt')) as OutboxOp[];
export const putOp = async (o: OutboxOp) => { await (await db()).put('outbox', o); };
export const deleteOp = async (id: string) => { await (await db()).delete('outbox', id); };

/** Device id + running number make the provisional receipt number printed while offline: OFF-D7K2-0012. */
export async function nextProvisionalNo() {
  let id = await kvGet<string>('deviceId');
  if (!id) { id = 'D' + Math.random().toString(36).slice(2, 6).toUpperCase(); await kvSet('deviceId', id); }
  const n = ((await kvGet<number>('provisionalSeq')) ?? 0) + 1;
  await kvSet('provisionalSeq', n);
  return `OFF-${id}-${String(n).padStart(4, '0')}`;
}
export const deviceId = async () => (await kvGet<string>('deviceId')) ?? (await nextProvisionalNo(), (await kvGet<string>('deviceId'))!);
