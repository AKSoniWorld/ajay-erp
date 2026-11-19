import { apiBlob } from './api';

/** Opens a server PDF in a new tab (the tab is opened first so the browser's pop-up blocker allows it). */
export async function openPdf(path: string, size?: 'A4' | 'A5') {
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await apiBlob(size ? `${path}${path.includes('?') ? '&' : '?'}size=${size}` : path));
    if (tab) tab.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) { tab?.close(); throw e; }
}

/** Downloads a server file (CSV, PDF…) with the sign-in token. */
export async function downloadFile(path: string, filename: string) {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
