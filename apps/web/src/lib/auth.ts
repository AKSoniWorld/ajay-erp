import type { AuthUser } from '@ajay/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;      // kept in memory only
  refreshToken: string | null;     // persisted so the shop device stays signed in (also offline)
  activeBranchId: string | null;   // the branch this device is working for
  setSession: (t: { accessToken: string; refreshToken: string }, user: AuthUser) => void;
  setTokens: (t: { accessToken: string; refreshToken: string }) => void;
  setBranch: (id: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(persist((set, get) => ({
  user: null, accessToken: null, refreshToken: null, activeBranchId: null,
  setSession: (t, user) => set({ ...t, user,
    activeBranchId: get().activeBranchId && user.branchIds.includes(get().activeBranchId!) ? get().activeBranchId : (user.branchIds[0] ?? null) }),
  setTokens: t => set(t),
  setBranch: id => set({ activeBranchId: id }),
  logout: () => set({ user: null, accessToken: null, refreshToken: null }),
}), { name: 'ajay-auth', partialize: s => ({ user: s.user, refreshToken: s.refreshToken, activeBranchId: s.activeBranchId }) }));
