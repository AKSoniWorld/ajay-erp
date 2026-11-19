export type TagSize = '40x25' | '50x25';
export type TagLanguage = 'ESCPOS' | 'TSPL';

export interface TagLabel {
  shortName: string; sku: string;
  grade: string;                 // 22K / 18K / 24K / Silver 92.5% / Diamond
  gross: string; net: string;    // grams, 3 decimals
  branchName: string;
  qr: string;                    // "AJ:<SKU>" — the only code on the tag
}

/** 203 dpi = 8 dots/mm */
export const widthDots = (s: TagSize) => (s === '50x25' ? 400 : 320);
const clean = (s: string) => s.replace(/[^\x20-\x7e]/g, '').replace(/"/g, "'");
const fit = (s: string, max: number) => clean(s).slice(0, max);

// The QR is printed large (5 dots per module, version 1–2 → ≈ 13–16 mm) so a phone camera or handheld scanner reads it first time.
const QR_CELL = 5, QR_DOTS = 25 * QR_CELL;

/** Plain ESC/POS (sequential layout: text above the QR). Calibrate on the actual printer with POST /print/tags/test. */
export function escposTag(l: TagLabel, size: TagSize, copies = 1): Buffer {
  const ESC = 0x1b, GS = 0x1d, b = (...n: number[]) => Buffer.from(n);
  const line = (s: string) => Buffer.from(clean(s) + '\n', 'latin1');
  const maxChars = Math.floor((widthDots(size) - 16) / 12);          // font A = 12 dots wide
  const qr = Buffer.from(l.qr, 'latin1'), len = qr.length + 3;
  const out: Buffer[] = [];
  for (let c = 0; c < copies; c++) {
    out.push(b(ESC, 0x40), b(ESC, 0x61, 1));                                       // init, centre
    out.push(b(ESC, 0x45, 1), line(fit(l.shortName, maxChars)), b(ESC, 0x45, 0));   // bold name
    out.push(line(fit(`${l.sku}  ${l.grade}`, maxChars)), line(fit(`G ${l.gross}  N ${l.net}`, maxChars)));
    out.push(b(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),                 // QR model 2
      b(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 4),                                  // module size 4 (sequential layout is height-limited)
      b(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31),                               // error correction M
      b(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30), qr,                 // store data
      b(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30), b(0x0a));                     // print
    out.push(line(fit(l.branchName, maxChars)), b(GS, 0x0c));                        // GS FF: feed to next label
  }
  return Buffer.concat(out);
}

/** TSPL/TSPL2 (TSC, Xprinter label models…): absolute layout — text on the left, big QR on the right. Usual language for 40×25 / 50×25 label printers. */
export function tsplTag(l: TagLabel, size: TagSize, copies = 1): Buffer {
  const w = widthDots(size), qrX = w - 8 - QR_DOTS, textW = qrX - 16;
  const mm = size === '50x25' ? 50 : 40;
  const cmd = [
    `SIZE ${mm} mm,25 mm`, 'GAP 2 mm,0 mm', 'DIRECTION 1', 'CLS',
    `QRCODE ${qrX},20,M,${QR_CELL},A,0,"${clean(l.qr)}"`,
    `TEXT 8,8,"2",0,1,1,"${fit(l.shortName, Math.floor(textW / 12))}"`,
    `TEXT 8,34,"1",0,1,1,"${fit(l.sku, Math.floor(textW / 8))}"`,
    `TEXT 8,54,"2",0,1,1,"${fit(l.grade, Math.floor(textW / 12))}"`,
    `TEXT 8,84,"1",0,1,1,"${fit(`G ${l.gross} g`, Math.floor(textW / 8))}"`,
    `TEXT 8,100,"1",0,1,1,"${fit(`N ${l.net} g`, Math.floor(textW / 8))}"`,
    `TEXT 8,168,"1",0,1,1,"${fit(l.branchName, Math.floor((w - 16) / 8))}"`,
    `PRINT 1,${copies}`,
  ];
  return Buffer.from(cmd.join('\r\n') + '\r\n', 'latin1');
}

export const renderTag = (lang: TagLanguage, l: TagLabel, size: TagSize, copies = 1) =>
  lang === 'TSPL' ? tsplTag(l, size, copies) : escposTag(l, size, copies);
