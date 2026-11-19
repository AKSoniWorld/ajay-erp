import { useAuth } from './auth';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public body?: any) { super(message); }
}

/** Nest returns {message: string | string[]}; some conflicts also carry a machine-readable `code`. */
const messageOf = (b: any, fallback: string) => (Array.isArray(b?.message) ? b.message.join('; ') : b?.message ?? fallback);

let refreshing: Promise<'ok' | 'denied' | 'offline'> | null = null;
/** One refresh at a time, shared by every request that hits a 401. */
export function refreshSession() {
  refreshing ??= (async () => {
    const { refreshToken, setTokens } = useAuth.getState();
    if (!refreshToken) return 'denied' as const;
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
      if (res.status === 401 || res.status === 400) return 'denied' as const;
      if (!res.ok) return 'offline' as const;
      setTokens(await res.json());
      return 'ok' as const;
    } catch { return 'offline' as const; }                      // no network: keep the session and work offline
  })().finally(() => { refreshing = null; });
  return refreshing;
}

type Opts = { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined | null> };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const pairs = Object.entries(opts.query ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]);
  const qs = pairs.length ? '?' + new URLSearchParams(pairs).toString() : '';
  const isForm = opts.body instanceof FormData;                       // file uploads: the browser sets the multipart header itself
  const call = () => fetch(`${BASE}${path}${qs}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { ...(opts.body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(useAuth.getState().accessToken ? { Authorization: `Bearer ${useAuth.getState().accessToken}` } : {}) },
    body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
  });
  let res = await call();
  if (res.status === 401 && useAuth.getState().refreshToken && path !== '/auth/login') {
    const r = await refreshSession();
    if (r === 'ok') res = await call();
    else if (r === 'denied') { useAuth.getState().logout(); throw new ApiError(401, 'Your session has ended. Please sign in again.'); }
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? safeJson(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, messageOf(body, res.statusText || 'Something went wrong'), body?.code, body);
  return body as T;
}
const safeJson = (t: string) => { try { return JSON.parse(t); } catch { return { message: t }; } };

/** Authenticated download (PDF etc.): the browser cannot send our bearer token on a plain link, so fetch it as a blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const call = () => fetch(`${BASE}${path}`, { headers: useAuth.getState().accessToken ? { Authorization: `Bearer ${useAuth.getState().accessToken}` } : {} });
  let res = await call();
  if (res.status === 401 && useAuth.getState().refreshToken) {
    if ((await refreshSession()) === 'ok') res = await call();
  }
  if (!res.ok) { const t = safeJson(await res.text()); throw new ApiError(res.status, messageOf(t, 'Could not open the file')); }
  return res.blob();
}
