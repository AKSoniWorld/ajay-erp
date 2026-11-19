import { formatINR } from '@/lib/format';

export interface ReceiptData {
  branchName: string; branchAddress?: string; provisionalNo: string; at: Date;
  customer: { name: string; mobile: string };
  lines: { name: string; qty: number; amountPaise: number }[];
  totals: { jewellery: number; making: number; gst: number; goldExchange: number; silverExchange: number; dairy: number; roundOff: number; finalPayable: number };
  gst: boolean; payments: { mode: string; amountPaise: number }[]; duePaise: number;
  fineGoldMg?: number; fineSilverMg?: number;       // only when the branch shows total fine weight on customer papers
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const row = (k: string, v: number) => `<tr><td>${k}</td><td class="r">${formatINR(v)}</td></tr>`;
const g = (mg: number) => `${(mg / 1000).toFixed(3)} g`;

/**
 * Receipt printed while offline. It is NOT a tax invoice: the official invoice number is issued when the bill reaches the server.
 * Like every customer paper it shows old metal only as an amount (and total fine weight if the branch allows) — never weights/rates/purity.
 */
export function printProvisional(r: ReceiptData, paper: 'A4' | 'A5' = 'A5') {
  const page = `@page{size:${paper};margin:12mm}body{max-width:none!important;margin:0!important;font-size:${paper === 'A4' ? 15 : 13}px}`;   // A5 = half of A4
  const t = r.totals, w = window.open('', '_blank', 'width=420,height=720');
  if (!w) return;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(r.provisionalNo)}</title>
<style>body{font:13px system-ui,sans-serif;max-width:300px;margin:12px auto;color:#000}h1{font-size:16px;margin:0}.c{text-align:center}.r{text-align:right}
table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}hr{border:0;border-top:1px dashed #000;margin:8px 0}.big{font-size:16px;font-weight:700}.box{border:1px solid #000;padding:4px;margin:8px 0;font-weight:700}${page}</style>
<div class="c"><h1>${esc(r.branchName)}</h1>${r.branchAddress ? `<div>${esc(r.branchAddress)}</div>` : ''}
<div class="box">PROVISIONAL RECEIPT — NOT A TAX INVOICE</div>
<div>No: <b>${esc(r.provisionalNo)}</b></div><div>${r.at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div></div><hr>
<div>${esc(r.customer.name)} · ${esc(r.customer.mobile)}</div><hr>
<table>${r.lines.map(l => `<tr><td>${esc(l.name)}${l.qty > 1 ? ` × ${l.qty}` : ''}</td><td class="r">${formatINR(l.amountPaise)}</td></tr>`).join('')}</table><hr>
<table>${row('Jewellery', t.jewellery)}${row('Making charges', t.making)}${r.gst ? row('GST', t.gst) : ''}
${t.goldExchange ? row('Old gold', -t.goldExchange) : ''}${t.silverExchange ? row('Old silver', -t.silverExchange) : ''}
${r.fineGoldMg ? `<tr><td>Old gold (fine weight)</td><td class="r">${g(r.fineGoldMg)}</td></tr>` : ''}${r.fineSilverMg ? `<tr><td>Old silver (fine weight)</td><td class="r">${g(r.fineSilverMg)}</td></tr>` : ''}
${t.dairy ? row('Dairy savings', -t.dairy) : ''}${t.roundOff ? row('Round off', t.roundOff) : ''}
<tr class="big"><td>Net payable</td><td class="r">${formatINR(t.finalPayable)}</td></tr></table><hr>
<table>${r.payments.map(p => row(p.mode, p.amountPaise)).join('')}${r.duePaise ? row('Balance due', r.duePaise) : ''}</table><hr>
<div class="c">Your official ${r.gst ? 'tax invoice' : 'bill'} number is issued when this bill is synced. Please keep this receipt.</div>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
}
