import 'server-only';

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ReceiptSale } from '@/lib/types';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const BOTTOM = 70;
const BODY_SIZE = 10;
const LINE_HEIGHT = 14;
const MUTED = rgb(0.4, 0.4, 0.45);

// Right edges of the numeric columns; the description fills the space left.
const COLUMNS = {
  description: MARGIN,
  qty: 345,
  unitPrice: 420,
  discount: 490,
  total: PAGE_WIDTH - MARGIN,
};
const DESCRIPTION_WIDTH = 255;

const money = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
});
const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Vancouver',
  dateStyle: 'medium',
});

const round2 = (value: number) => Math.round(value * 100) / 100;

// The standard PDF fonts only cover WinAnsi (roughly Latin-1). Replace common
// typographic characters and strip accents from anything else.
function toWinAnsi(text: string) {
  return text
    .normalize('NFC')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, (char) => {
      const stripped = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      return /^[\x20-\x7E\xA1-\xFF]+$/.test(stripped) ? stripped : '?';
    });
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

class ReceiptWriter {
  private page!: PDFPage;
  private y = 0;

  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
  ) {}

  newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  ensureSpace(height: number, onBreak?: () => void) {
    if (this.y - height < BOTTOM) {
      this.newPage();
      onBreak?.();
    }
  }

  text(
    value: string,
    x: number,
    options: { bold?: boolean; size?: number; align?: 'left' | 'right'; muted?: boolean } = {},
  ) {
    const font = options.bold ? this.bold : this.regular;
    const size = options.size ?? BODY_SIZE;
    const safe = toWinAnsi(value);
    const drawX =
      options.align === 'right' ? x - font.widthOfTextAtSize(safe, size) : x;
    this.page.drawText(safe, {
      x: drawX,
      y: this.y,
      size,
      font,
      color: options.muted ? MUTED : rgb(0, 0, 0),
    });
  }

  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: MUTED,
    });
  }

  down(amount: number) {
    this.y -= amount;
  }

  tableHeader() {
    this.text('Item', COLUMNS.description, { bold: true });
    this.text('Qty', COLUMNS.qty, { bold: true, align: 'right' });
    this.text('Unit price', COLUMNS.unitPrice, { bold: true, align: 'right' });
    this.text('Discount', COLUMNS.discount, { bold: true, align: 'right' });
    this.text('Total', COLUMNS.total, { bold: true, align: 'right' });
    this.down(6);
    this.rule();
    this.down(LINE_HEIGHT);
  }

  receipt(sale: ReceiptSale) {
    this.newPage();
    this.text('Bici', MARGIN, { bold: true, size: 22 });
    this.text('Sales Receipt', COLUMNS.total, { size: 12, align: 'right', muted: true });
    this.down(36);

    const details: [string, string][] = [
      ['Receipt #', sale.ticket_number],
      ['Date', dateFormat.format(new Date(sale.complete_time))],
      ['Customer', sale.customer_name || '-'],
    ];
    for (const [label, value] of details) {
      this.text(label, MARGIN, { bold: true });
      this.text(value, MARGIN + 80);
      this.down(LINE_HEIGHT + 2);
    }
    this.down(14);
    this.tableHeader();

    for (const line of sale.lines) {
      const descriptionLines = wrap(
        line.description,
        this.regular,
        BODY_SIZE,
        DESCRIPTION_WIDTH,
      );
      this.ensureSpace(descriptionLines.length * LINE_HEIGHT, () =>
        this.tableHeader(),
      );
      this.text(descriptionLines[0], COLUMNS.description);
      this.text(String(line.quantity), COLUMNS.qty, { align: 'right' });
      this.text(money.format(line.unit_price), COLUMNS.unitPrice, { align: 'right' });
      this.text(
        line.discount > 0.004 ? `-${money.format(line.discount)}` : '',
        COLUMNS.discount,
        { align: 'right' },
      );
      this.text(money.format(line.subtotal), COLUMNS.total, { align: 'right' });
      for (const extra of descriptionLines.slice(1)) {
        this.down(LINE_HEIGHT);
        this.text(extra, COLUMNS.description);
      }
      this.down(LINE_HEIGHT + 4);
    }

    // Totals are recomputed from the printed lines so that omitted lines
    // (e.g. shipping) cannot be inferred from the difference.
    const subtotal = round2(sale.lines.reduce((sum, l) => sum + l.subtotal, 0));
    const tax = round2(sale.lines.reduce((sum, l) => sum + l.tax, 0));
    const totals: [string, number, boolean][] = [
      ['Subtotal', subtotal, false],
      ['Tax', tax, false],
      ['Total', round2(subtotal + tax), true],
    ];

    this.ensureSpace(LINE_HEIGHT * 5);
    this.rule();
    this.down(LINE_HEIGHT + 4);
    for (const [label, value, isBold] of totals) {
      this.text(label, COLUMNS.discount, { align: 'right', bold: isBold });
      this.text(money.format(value), COLUMNS.total, { align: 'right', bold: isBold });
      this.down(LINE_HEIGHT + 2);
    }
  }
}

/** Renders one receipt per sale (continuing onto extra pages if needed). */
export async function renderReceiptsPdf(sales: ReceiptSale[]) {
  const doc = await PDFDocument.create();
  doc.setTitle('Sales receipts');
  doc.setProducer('Bici');
  doc.setCreator('Bici');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new ReceiptWriter(doc, regular, bold);

  for (const sale of sales) {
    writer.receipt(sale);
  }
  if (sales.length === 0) {
    writer.newPage();
    writer.text('No linked sales to include.', MARGIN);
  }
  return doc.save();
}
