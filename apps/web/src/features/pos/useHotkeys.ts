import { useEffect } from 'react';

/** Function keys for the till (F2 find, F3 customer, F8 payment, F9 finish). Keys are swallowed so the browser doesn't act on them. */
export function useHotkeys(map: Record<string, () => void>) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { const fn = map[e.key]; if (fn) { e.preventDefault(); fn(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [map]);
}
