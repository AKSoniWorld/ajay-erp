import { amountInWords } from '../../common/utils/money';
import { STATE_CODES } from './state-codes';

export type Paper = 'A4' | 'A5';
export interface DocOpts { symbol: string; font: string; draft?: boolean; paper?: Paper }
/** Printable width in points (A4 = 595pt, A5 = 420pt wide, i.e. half of A4) and page margins. */
const LAYOUT = { A4: { width: 539, margins: [28, 28, 28, 44] }, A5: { width: 375, margins: [22, 22, 22, 38] } } as const;

/** Ã¢â€šÂ¹ 1,23,456.00 Ã¢â‚¬â€ symbol is "Ã¢â€šÂ¹" when the embedded font has it, otherwise "Rs.". */
export const inr = (paise: number, symbol: string) =>
  `${paise < 0 ? '-' : ''}${symbol} ${(Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateStr = (d: any) => new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
const grams = (mg?: number) => (mg === undefined || mg === null ? '' : (mg / 1000).toFixed(3));
const gradeOf = (i: any) => (i.karat ? `${i.karat}K` : i.purityPct !== undefined ? `${i.purityPct}%` : '');
const th = (text: string, alignment = 'left') => ({ text, style: 'th', alignment });
const row = (label: string, value: string, extra: object = {}) =>
  [{ text: label, alignment: 'right', ...extra }, { text: value, alignment: 'right', ...extra }];

const styles = {
  h1: { fontSize: 14, bold: true }, title: { fontSize: 13, bold: true, color: '#7a5c00' },
  th: { bold: true, fillColor: '#efe6c8', fontSize: 8 }, small: { fontSize: 8, color: '#444' },
};

/**
 * A4 GST invoice / credit note. Input is the whitelisted customer view ONLY (pos customerView),
 * so gross/less/net weight, purity and rate of OLD metal and dairy details can never appear here.
 */
export function buildInvoiceDoc(view: any, o: DocOpts) {
  const paper: Paper = o.paper ?? 'A4', L = LAYOUT[paper], small = paper === 'A5';
  const invoiceInr = (paise: number) =>
    `${paise < 0 ? '-' : ''}${o.symbol} ${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;
  const m = (p: number) => invoiceInr(p);
  const doc = view.document, br = view.branch, cu = view.customer;
  const isCN = doc.type === 'CREDIT_NOTE';
  const nonGst = doc.taxMode === 'NON_GST';   // bill of supply: no GST charged
  const title = doc.status === 'DRAFT' ? (nonGst ? 'DRAFT BILL OF SUPPLY' : 'DRAFT INVOICE')
    : isCN ? (nonGst ? 'CREDIT NOTE (BILL OF SUPPLY)' : 'CREDIT NOTE') : nonGst ? 'BILL OF SUPPLY' : 'TAX INVOICE';
  const items: any[] = view.items;
  const taxableBeforeDiscount = view.taxableBeforeDiscount ?? items.reduce((s, i) => s + i.amount, 0);
  const discountPaise = view.discountPaise ?? 0;
  const discountDisplayPaise = view.discountAppliedPaise ?? discountPaise;
  const taxable = view.taxable ?? (taxableBeforeDiscount - (view.discountTaxablePaise ?? discountPaise));
  const half = String(view.gst.ratePct / 2);
  const code = STATE_CODES[br.state ?? ''] ?? '';

  const totals: any[] = [
    row('Taxable value', m(taxableBeforeDiscount)),
    ...(discountDisplayPaise ? [row(nonGst ? 'Less: Discount' : 'Less: Discount (incl. GST)', m(-discountDisplayPaise))] : []),
    ...(discountDisplayPaise ? [row('Taxable after discount', m(taxable), { bold: true })] : []),
    ...(nonGst ? [
      row('Total', m(taxable), { bold: true }),
    ] : [
      row(`CGST @ ${half}%`, m(view.gst.cgst)),
      row(`SGST @ ${half}%`, m(view.gst.sgst)),
      row('Invoice value', m(taxable + view.gst.total), { bold: true }),
    ]),
  ];
  if (view.oldGoldExchange) totals.push(row('Less: Old Gold Exchange', m(-view.oldGoldExchange)));
  if (view.oldSilverExchange) totals.push(row('Less: Old Silver Exchange', m(-view.oldSilverExchange)));
  if (view.oldGoldFineWeightMg) totals.push(row('Old Gold Jama (fine weight)', `${grams(view.oldGoldFineWeightMg)} g`, { italics: true }));
  if (view.oldSilverFineWeightMg) totals.push(row('Old Silver Jama (fine weight)', `${grams(view.oldSilverFineWeightMg)} g`, { italics: true }));
  if (view.dairyAdjustment) totals.push(row('Less: Dairy Adjustment', m(-view.dairyAdjustment)));
  if (view.roundOff) totals.push(row('Round off', m(view.roundOff)));
  totals.push(row(isCN ? 'REFUND DUE' : 'NET PAYABLE', m(view.netPayable), { bold: true, fontSize: 11 }));
  if (view.advanceAdjusted) totals.push(row('Advance adjusted', m(view.advanceAdjusted)));
  if (view.amountReceived) totals.push(row('Amount received', m(view.amountReceived)));
  if (view.balanceDue) totals.push(row('Balance due', m(view.balanceDue), { bold: true }));

  return {
    pageSize: paper, pageMargins: [...L.margins], defaultStyle: { font: o.font, fontSize: small ? 7.5 : 9 }, styles,
    info: { title: `${title} ${doc.number ?? ''}`.trim() },
    ...(o.draft && { watermark: { text: 'DRAFT', color: '#888888', opacity: 0.15, bold: true } }),
    content: [
      { columns: [
        { width: '*', stack: [
          { text: br.name, style: 'h1' }, { text: br.address ?? '' },
          ...(br.whatsappNumber ? [{ text: `Mobile: ${br.whatsappNumber}` }] : []),
          ...(!nonGst && br.gstin ? [{ text: `GSTIN: ${br.gstin}`, bold: true }] : []),
          { text: `State: ${br.state ?? ''}${code ? ` (${code})` : ''}` }] },
        { width: 'auto', stack: [
          { text: title, style: 'title', alignment: 'right' },
          { qr: doc.number ?? 'DRAFT', fit: small ? 48 : 64, alignment: 'right', margin: [0, 4, 0, 0] }] },
      ] },
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: L.width, y2: 4, lineWidth: 0.7 }], margin: [0, 2, 0, 6] },
      { columns: [
        { width: '*', stack: [
          { text: 'Billed to', style: 'small' },
          ...(cu?.id ? [{ text: `Customer ID: ${cu.id}` }] : []),
          { text: cu?.name ?? 'Walk-in customer', bold: true },
          ...(cu?.mobile ? [{ text: `Mobile: ${cu.mobile}` }] : []),
          ...(cu?.address ? [{ text: cu.address }] : [])] },
        { width: 'auto', stack: [
          { text: `${isCN ? 'Credit note' : 'Invoice'} no: ${doc.number ?? 'Ã¢â‚¬â€'}`, bold: true, alignment: 'right' },
          { text: `Date: ${dateStr(doc.date)}`, alignment: 'right' },
          ...(nonGst ? [] : [{ text: `Place of supply: ${br.state ?? ''}${code ? ` (${code})` : ''}`, alignment: 'right' }]),
          ...(doc.againstInvoice ? [{ text: `Against invoice: ${doc.againstInvoice}`, alignment: 'right' }] : [])] },
      ], margin: [0, 0, 0, 8] },
      { table: { headerRows: 1, widths: small ? [12, '*', 28, 24, 36, 36, 16, 54] : [16, '*', 38, 32, 44, 44, 22, 66], body: [
        [th('#'), th('Description'), th('HSN'), th('Karat'), th('Gross g', 'right'), th('Net g', 'right'), th('Qty', 'right'), th('Amount', 'right')],
        ...items.map((i, n) => [
          String(n + 1),
          { stack: [{ text: i.name, bold: true }, { text: i.sku, style: 'small' }] },
          i.hsn ?? '', gradeOf(i),
          { text: grams(i.grossWeightMg), alignment: 'right' }, { text: grams(i.netWeightMg), alignment: 'right' },
          { text: String(i.qty ?? 1), alignment: 'right' }, { text: m(i.amount), alignment: 'right' }]),
      ] }, layout: 'lightHorizontalLines' },
      { columns: [{ width: '*', text: '' }, { width: small ? 200 : 250, table: { widths: ['*', 'auto'], body: totals }, layout: 'noBorders' }], margin: [0, 8, 0, 6] },
      { text: `Amount in words: ${amountInWords(view.netPayable)}`, bold: true, margin: [0, 2, 0, 4] },
      ...(view.remarks ? [{ text: `Remarks: ${view.remarks}`, margin: [0, 0, 0, 4] }] : []),
      ...(nonGst ? [{ text: 'This is a bill of supply. No GST has been charged on this bill.', bold: true, margin: [0, 4, 0, 0] }] : []),
      { text: 'Certified that the particulars given above are true and correct. Goods once sold will be exchanged only as per shop policy. Subject to local jurisdiction.', style: 'small', margin: [0, 6, 0, 18] },
      { columns: [{ text: 'Customer signature', style: 'small' }, { stack: [{ text: `For ${br.name}`, alignment: 'right', bold: true }, { text: 'Authorised signatory', alignment: 'right', style: 'small', margin: [0, 22, 0, 0] }] }] },
    ],
    footer: (page: number, pages: number) => ({ text: `Page ${page} of ${pages}`, alignment: 'center', fontSize: 8, margin: [0, 12, 0, 0] }),
  };
}

export interface ReceiptData {
  title: string; receiptNo: string; date: Date | string;
  branch: { name: string; address?: string; gstin?: string; receiptPaper?: Paper };
  customer: { name: string; mobile?: string };
  rows: [string, string][]; amountPaise: number; amountLabel?: string;
}

/** Receipt (dairy collection, advance, due payment): A5 (half of A4) by default, A4 on request. Amounts only. */
export function buildReceiptDoc(r: ReceiptData, o: DocOpts) {
  const paper: Paper = o.paper ?? 'A5', W = paper === 'A4' ? 539 : 364;
  return {
    pageSize: paper, pageMargins: [28, 28, 28, 28], defaultStyle: { font: o.font, fontSize: paper === 'A4' ? 11 : 10 }, styles,
    info: { title: `${r.title} ${r.receiptNo}` },
    content: [
      { text: r.branch.name, style: 'h1' }, { text: r.branch.address ?? '' },
      ...(r.branch.gstin ? [{ text: `GSTIN: ${r.branch.gstin}` }] : []),
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: W, y2: 4, lineWidth: 0.7 }], margin: [0, 2, 0, 8] },
      { text: r.title, style: 'title', margin: [0, 0, 0, 6] },
      { columns: [{ text: `Receipt no: ${r.receiptNo}`, bold: true }, { text: `Date: ${dateStr(r.date)}`, alignment: 'right' }], margin: [0, 0, 0, 6] },
      { text: `Received from: ${r.customer.name}${r.customer.mobile ? ` (${r.customer.mobile})` : ''}`, margin: [0, 0, 0, 8] },
      { table: { widths: ['*', 'auto'], body: r.rows.map(([k, v]) => [k, { text: v, alignment: 'right' }]) }, layout: 'lightHorizontalLines' },
      { text: `${r.amountLabel ?? 'Amount received'}: ${inr(r.amountPaise, o.symbol)}`, bold: true, fontSize: 12, margin: [0, 10, 0, 2] },
      { text: amountInWords(r.amountPaise), style: 'small' },
      { text: `For ${r.branch.name}`, alignment: 'right', bold: true, margin: [0, 28, 0, 0] },
      { text: 'Authorised signatory', alignment: 'right', style: 'small' },
    ],
  };
}
