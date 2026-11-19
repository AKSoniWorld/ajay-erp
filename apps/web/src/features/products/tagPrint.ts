import QRCode from 'qrcode';

export interface TagLabelData { shortName: string; sku: string; grade: string; gross: string; net: string; branchName: string; qr: string }
export type TagSize = '40x25' | '50x25';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Prints the tags through the browser's print dialog: pick the label printer (its normal driver) and the label size is set for you.
 * Works with any label printer that has a driver; the QR is drawn here so it also works offline.
 */
export async function printLabelsInBrowser(items: { label: TagLabelData; copies: number }[], size: TagSize) {
  const w = size === '50x25' ? 50 : 40;
  const tags: string[] = [];
  for (const { label: l, copies } of items) {
    const qr = await QRCode.toString(l.qr, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    for (let i = 0; i < copies; i++) tags.push(`<div class="tag"><div class="txt"><b class="n">${esc(l.shortName)}</b><span>${esc(l.sku)}</span><b>${esc(l.grade)}</b>
      <span>G ${esc(l.gross)} g</span><span>N ${esc(l.net)} g</span><span class="br">${esc(l.branchName)}</span></div><div class="qr">${qr}</div></div>`);
  }
  const html = `<!doctype html><meta charset="utf-8"><style>
    @page{size:${w}mm 25mm;margin:0} *{box-sizing:border-box} body{margin:0;font-family:system-ui,sans-serif;color:#000}
    .tag{width:${w}mm;height:25mm;padding:1.3mm;display:flex;gap:1mm;page-break-after:always;overflow:hidden}
    .txt{flex:1;min-width:0;display:flex;flex-direction:column;font-size:6.5pt;line-height:1.2}.n{font-size:8pt}.br{margin-top:auto;font-size:5.5pt}
    .txt span,.n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.qr{width:16mm;height:16mm;align-self:center}.qr svg{width:100%;height:100%}</style>${tags.join('')}`;
  const f = document.createElement('iframe');
  Object.assign(f.style, { position: 'fixed', width: '0', height: '0', border: '0' });
  document.body.appendChild(f);
  f.onload = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); };
  f.srcdoc = html;
}

/** Sends the printer-ready bytes (ESC/POS or TSPL from the server) straight to a USB label printer. Chrome/Edge only (WebUSB). */
export async function printBytesOverUsb(bytes: Uint8Array) {
  const usb = (navigator as any).usb;
  if (!usb) throw new Error('This browser cannot print over USB directly. Use "Browser print" instead.');
  const dev = (await usb.getDevices())[0] ?? (await usb.requestDevice({ filters: [] }));
  await dev.open();
  if (dev.configuration === null) await dev.selectConfiguration(1);
  let iface: number | undefined, ep = 0;
  for (const i of dev.configuration.interfaces) for (const a of i.alternates) for (const e of a.endpoints)
    if (e.direction === 'out' && e.type === 'bulk') { iface = i.interfaceNumber; ep = e.endpointNumber; }
  if (iface === undefined) { await dev.close(); throw new Error('No printable USB endpoint was found on this device.'); }
  await dev.claimInterface(iface);
  try { for (let o = 0; o < bytes.length; o += 4096) await dev.transferOut(ep, bytes.slice(o, o + 4096)); }
  finally { await dev.releaseInterface(iface); await dev.close(); }
}
export const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
