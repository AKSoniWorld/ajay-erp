import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { env } from '../../config';
import { buildInvoiceDoc, buildReceiptDoc, Paper, ReceiptData } from './docs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake');

/**
 * Uses Noto Sans when found (has the ₹ glyph). If the font files are missing it falls back to the built-in
 * Helvetica and prints "Rs." — documents always render; install fonts-noto-core on the server to get ₹.
 */
@Injectable()
export class PdfService {
  private readonly log = new Logger(PdfService.name);
  readonly font: string;
  readonly symbol: string;
  private printer: any;

  constructor() {
    const regular = join(env.PDF_FONT_DIR, 'NotoSans-Regular.ttf'), bold = join(env.PDF_FONT_DIR, 'NotoSans-Bold.ttf');
    const noto = existsSync(regular) && existsSync(bold);
    this.font = noto ? 'NotoSans' : 'Helvetica';
    this.symbol = noto ? '₹' : 'Rs.';
    if (!noto) this.log.warn(`Noto Sans not found in ${env.PDF_FONT_DIR}; PDFs will show "Rs." instead of ₹`);
    this.printer = new PdfPrinter(noto
      ? { NotoSans: { normal: regular, bold, italics: regular, bolditalics: bold } }
      : { Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } });
  }

  private get opts() { return { symbol: this.symbol, font: this.font }; }
  invoiceDoc(view: any, draft = false, paper?: Paper) { return buildInvoiceDoc(view, { ...this.opts, draft, paper }); }
  receiptDoc(r: ReceiptData, paper?: Paper) { return buildReceiptDoc(r, { ...this.opts, paper }); }

  render(def: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = this.printer.createPdfKitDocument(def);
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }
}
