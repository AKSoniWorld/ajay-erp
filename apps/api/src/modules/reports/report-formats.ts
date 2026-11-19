import { inr } from '../print/docs';
import { ColType, Report } from './report.types';

const IST = 19_800_000;
const dt = (d: any) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 16).replace('T', ' ');

/** Plain (CSV) formatting: rupees with 2 decimals, grams with 3 decimals, IST dates. */
export function plain(v: any, type: ColType): string {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'money') return (v / 100).toFixed(2);
  if (type === 'weight') return (v / 1000).toFixed(3);
  if (type === 'date') return dt(v);
  return String(v);
}

function csvCell(s: string, type: ColType) {
  if (type === 'text' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;          // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(r: Report): string {
  const head = r.columns.map(c => csvCell(c.label, 'text')).join(',');
  const body = r.rows.map(row => r.columns.map(c => csvCell(plain(row[c.key], c.type), c.type)).join(','));
  const tot = r.totals ? [r.columns.map((c, i) => csvCell(i === 0 ? 'TOTAL' : plain(r.totals![c.key], c.type), c.type)).join(',')] : [];
  return '\uFEFF' + [head, ...body, ...tot].join('\r\n') + '\r\n';
}

/** Landscape A4 table. */
export function reportPdfDoc(r: Report, o: { symbol: string; font: string }) {
  const cell = (v: any, c: { type: ColType }) => ({
    text: c.type === 'money' && v !== null && v !== undefined && v !== '' ? inr(v, o.symbol) : plain(v, c.type),
    alignment: ['money', 'weight', 'int', 'pct'].includes(c.type) ? 'right' : 'left',
  });
  const n = r.columns.length;
  return {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [24, 28, 24, 32], defaultStyle: { font: o.font, fontSize: n > 9 ? 6.5 : 8 },
    info: { title: r.title },
    content: [
      { text: r.title, fontSize: 14, bold: true },
      ...(r.period ? [{ text: `Period: ${r.period.from} to ${r.period.to}`, margin: [0, 2, 0, 8], color: '#444' }] : []),
      { table: { headerRows: 1, widths: r.columns.map(() => 'auto'), body: [
        r.columns.map(c => ({ text: c.label, bold: true, fillColor: '#efe6c8', alignment: ['money', 'weight', 'int', 'pct'].includes(c.type) ? 'right' : 'left' })),
        ...r.rows.map(row => r.columns.map(c => cell(row[c.key], c))),
        ...(r.totals ? [r.columns.map((c, i) => ({ ...(i === 0 ? { text: 'TOTAL', alignment: 'left' } : cell(r.totals![c.key], c)), bold: true }))] : []),
      ] }, layout: 'lightHorizontalLines' },
    ],
    footer: (page: number, pages: number) => ({ text: `Page ${page} of ${pages}`, alignment: 'center', fontSize: 7 }),
  };
}
