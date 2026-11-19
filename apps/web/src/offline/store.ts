import { create } from 'zustand';
import { outbox } from './db';

interface SyncState {
  syncing: boolean; lastSyncAt: number | null; error: string | null;
  counts: { pending: number; review: number; failed: number };
  set: (p: Partial<SyncState>) => void;
  refresh: () => Promise<void>;
}
export const useSync = create<SyncState>((set) => ({
  syncing: false, lastSyncAt: null, error: null, counts: { pending: 0, review: 0, failed: 0 },
  set: p => set(p),
  refresh: async () => {
    const ops = await outbox();
    set({ counts: {
      pending: ops.filter(o => o.status === 'PENDING' || o.status === 'SENDING').length,
      review: ops.filter(o => o.status === 'NEEDS_REVIEW').length,
      failed: ops.filter(o => o.status === 'FAILED').length } });
  },
}));
