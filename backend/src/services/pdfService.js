const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const NAVY = '#1b2a4b';
const NAVY_DARK = '#141f38';
const GOLD = '#c9a227';
const GOLD_LIGHT = '#e8d38a';
const GRAY = '#64748b';
const BORDER = '#e2e8f0';
const ROW_ALT = '#f6f8fb';
const TEXT_DARK = '#1e293b';
const SUCCESS = '#0f9d63';
const DANGER = '#dc2626';

const STATUS_COLORS = {
  draft: ['#f1f5f9', '#64748b'],
  posted: ['#e6f6ee', SUCCESS],
  paid: ['#e6f6ee', SUCCESS],
  cancelled: ['#fdeaea', DANGER],
  void: ['#fdeaea', DANGER],
  partial: ['#fef3e2', '#c07f0a'],
  sent: ['#eaf1fd', '#2563eb'],
  overdue: ['#fdeaea', DANGER],
};

// ---------------------------------------------------------------------------
// Arabic font registration + bidi-aware text drawing
// ---------------------------------------------------------------------------
const ARABIC_RE = /[؀-ۿݐ-ݿ]/;

// Registered fonts live on the PDFDocument instance itself, not globally — each
// generated PDF is a fresh `doc`, so the Arabic fonts must be (re-)registered
// on every one of them, tracked via a flag stashed on that instance.
function registerArabicFonts(doc) {
  if (doc._arabicFontsRegistered) return true;
  try {
    const base = path.join(path.dirname(require.resolve('@fontsource/noto-naskh-arabic/package.json')), 'files');
    doc.registerFont('Arabic', path.join(base, 'noto-naskh-arabic-arabic-400-normal.woff'));
    doc.registerFont('Arabic-Bold', path.join(base, 'noto-naskh-arabic-arabic-700-normal.woff'));
    doc._arabicFontsRegistered = true;
  } catch (e) {
    doc._arabicFontsRegistered = false;
  }
  return doc._arabicFontsRegistered;
}

// Splits a string into runs of contiguous Arabic vs non-Arabic characters
// (spaces are kept attached to whichever run they trail) so each run can be
// shaped/measured with the correct font.
function splitRuns(str) {
  const runs = [];
  let cur = '';
  let curIsArabic = null;
  for (const ch of str) {
    const isAr = ARABIC_RE.test(ch);
    if (curIsArabic === null) { curIsArabic = isAr; cur = ch; continue; }
    if (isAr === curIsArabic || ch === ' ') cur += ch;
    else { runs.push({ text: cur, arabic: curIsArabic }); cur = ch; curIsArabic = isAr; }
  }
  if (cur) runs.push({ text: cur, arabic: curIsArabic });
  return runs;
}

// Truncates plain (non-Arabic) text with an ellipsis so it never overflows
// past `maxWidth` into a neighboring table cell.
function truncateToWidth(doc, text, maxWidth, font) {
  doc.font(font);
  if (doc.widthOfString(text) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && doc.widthOfString(out + '…') > maxWidth) out = out.slice(0, -1);
  return out + '…';
}

// Splits a (possibly mixed Arabic/Latin) string into its script runs and
// measures the total rendered width — used both to decide whether truncation
// is needed and to size the final visual layout.
//
// IMPORTANT: Arabic run text is passed through UNMODIFIED — no character
// reshaping, no reversal. PDFKit's font rendering goes through fontkit's
// `font.layout()`, which already does full OpenType Arabic shaping (choosing
// correct initial/medial/final glyph forms) AND correctly reorders multi-word
// RTL runs into visual order on its own. An earlier version of this file
// pre-shaped runs with the `arabic-reshaper` package and then reversed them
// character-by-character before handing them to PDFKit — that was doing the
// engine's job a second time on top of it, which is what produced garbled,
// disconnected-looking Arabic. Verified against a browser-rendered reference
// (LibreOffice/system text engine) showing raw pass-through matches exactly.
function bidiRunsAndWidth(doc, str, bold) {
  const runs = splitRuns(str).map((r) => ({
    text: r.text,
    arabic: r.arabic,
    font: r.arabic ? (bold ? 'Arabic-Bold' : 'Arabic') : (bold ? 'Helvetica-Bold' : 'Helvetica'),
  }));
  const width = runs.reduce((sum, r) => { doc.font(r.font); return sum + doc.widthOfString(r.text); }, 0);
  return { runs, width };
}

// Truncates a mixed Arabic/Latin string (BEFORE shaping) with an ellipsis so
// it never overflows `maxWidth`. Trims from the logical end of the string —
// same "keep the beginning, cut the end" behavior as truncateToWidth — which
// is what let Arabic descriptions overrun into the next table column/cell
// (drawBidi previously drew every run at full size with no width check at all).
function truncateBidiToWidth(doc, str, maxWidth, bold) {
  if (bidiRunsAndWidth(doc, str, bold).width <= maxWidth) return str;
  let out = str;
  while (out.length > 1) {
    out = out.slice(0, -1);
    const candidate = out + '…';
    if (bidiRunsAndWidth(doc, candidate, bold).width <= maxWidth) return candidate;
  }
  return '…';
}

// Draws text that may contain Arabic. Splits into per-script runs so each
// can use the right font (the Arabic font has no digit/Latin glyphs and vice
// versa), reverses the RUN order so e.g. a trailing English/number run ends
// up on the correct (left) side of an RTL-dominant line, then hands each
// run's text to PDFKit as-is — fontkit shapes and internally reorders each
// run correctly on its own. Falls back to plain Helvetica for pure Latin
// strings (skips font lookup/registration entirely).
function drawBidi(doc, str, x, y, opts = {}) {
  if (str === null || str === undefined || str === '') return;
  str = String(str);
  const { width, align = 'left', fontSize, color, bold } = opts;
  if (fontSize) doc.fontSize(fontSize);
  if (color) doc.fillColor(color);

  const hasArabic = ARABIC_RE.test(str);
  if (!hasArabic || !registerArabicFonts(doc)) {
    const font = bold ? 'Helvetica-Bold' : 'Helvetica';
    const display = width ? truncateToWidth(doc, str, width, font) : str;
    doc.font(font).text(display, x, y, { width, align, lineBreak: false });
    return;
  }

  const display = width ? truncateBidiToWidth(doc, str, width, bold) : str;
  const { runs, width: totalWidth } = bidiRunsAndWidth(doc, display, bold);
  const visualRuns = [...runs].reverse();
  const boxWidth = width || totalWidth;
  let startX = x;
  if (align === 'right') startX = x + boxWidth - totalWidth;
  else if (align === 'center') startX = x + (boxWidth - totalWidth) / 2;

  let curX = startX;
  visualRuns.forEach((r) => {
    doc.font(r.font);
    doc.text(r.text, curX, y, { lineBreak: false });
    curX += doc.widthOfString(r.text);
  });
}

// ---------------------------------------------------------------------------
// Document scaffolding
// ---------------------------------------------------------------------------
function newDoc(res, filename) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

// Resolves a company's stored logo_url (e.g. /uploads/<companyId>/logo/foo.png) to the
// actual file on disk, so it can be stamped directly into generated PDFs. Returns null
// if there's no logo or the file is missing, so callers can fall back to text-only.
function resolveLogoPath(company) {
  if (!company?.logo_url) return null;
  const filePath = path.join(__dirname, '..', company.logo_url.replace(/^\/uploads\//, 'uploads/'));
  return fs.existsSync(filePath) ? filePath : null;
}

// Finds the largest font size (down to minSize) at which `text` fits within
// maxWidth on a single line, so headings never get auto-wrapped by PDFKit.
function fitFontSize(doc, text, maxWidth, font, maxSize, minSize = 10) {
  let size = maxSize;
  doc.font(font);
  while (size > minSize && doc.fontSize(size).widthOfString(text) > maxWidth) size -= 0.5;
  return size;
}

function header(doc, company, title, subtitle) {
  const w = doc.page.width;
  const bandHeight = 96;

  // Base navy band + darker diagonal accent slab for visual depth
  doc.rect(0, 0, w, bandHeight).fill(NAVY);
  doc.save();
  doc.moveTo(w * 0.62, 0).lineTo(w, 0).lineTo(w, bandHeight).lineTo(w * 0.74, bandHeight).closePath().fill(NAVY_DARK);
  doc.restore();
  // Gold accent rule under the band
  doc.rect(0, bandHeight, w, 3).fill(GOLD);

  const logoPath = resolveLogoPath(company);
  let textStartX = 40;
  const logoBoxY = 20, logoBoxSize = 56;
  if (logoPath) {
    try {
      doc.roundedRect(40, logoBoxY, logoBoxSize, logoBoxSize, 8).fill('#ffffff');
      doc.image(logoPath, 46, logoBoxY + 6, { fit: [logoBoxSize - 12, logoBoxSize - 12], align: 'center', valign: 'center' });
      textStartX = 40 + logoBoxSize + 14;
    } catch (e) { /* corrupt/unsupported image — fall back to text-only header */ }
  } else {
    // Initial-letter badge as a placeholder mark
    const initial = (company?.name_en || 'A').trim().charAt(0).toUpperCase();
    doc.roundedRect(40, logoBoxY, logoBoxSize, logoBoxSize, 8).fill(GOLD);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(24).text(initial, 40, logoBoxY + 15, { width: logoBoxSize, align: 'center' });
    textStartX = 40 + logoBoxSize + 14;
  }

  const rightBoundary = w - 40;
  // Reserve space for the title pill first so the company name never runs
  // underneath it, then auto-shrink the name to fit on a single line.
  doc.font('Helvetica-Bold').fontSize(13);
  const titleWidth = doc.widthOfString(title) + 28;
  const pillX = rightBoundary - titleWidth;
  const leftBlockWidth = pillX - 12 - textStartX;

  const companyName = company?.name_en || 'Al Fahad Group';
  const nameSize = fitFontSize(doc, companyName, leftBlockWidth, 'Helvetica-Bold', 16, 10);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(nameSize).text(companyName, textStartX, 30, { lineBreak: false });
  drawBidi(doc, company?.name_ar || '', textStartX, 52, { fontSize: 10, color: GOLD_LIGHT, width: leftBlockWidth });

  // Title pill, top right
  doc.roundedRect(pillX, 26, titleWidth, 24, 12).fill(GOLD);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY_DARK).text(title, pillX, 33, { width: titleWidth, align: 'center', lineBreak: false });

  if (subtitle) {
    drawBidi(doc, subtitle, 40, 58, { fontSize: 9.5, color: '#c7d0e4', width: rightBoundary - 40, align: 'right' });
  }

  doc.fillColor('#000000');
  doc.y = bandHeight + 24;
}

function footer(doc, company) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    const w = doc.page.width;
    // Text drawn at/beyond the page's bottom margin boundary makes PDFKit
    // silently auto-append a new page (continueOnNewPage) — keep everything
    // safely above `page.height - margins.bottom`.
    const maxY = doc.page.height - doc.page.margins.bottom;
    const lineY = maxY - 22;
    const textY = maxY - 14;
    doc.moveTo(40, lineY).lineTo(w - 40, lineY).lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.fontSize(8).fillColor(GRAY).font('Helvetica');
    doc.text(company?.name_en || 'Al Fahad Group', 40, textY, { width: 200, align: 'left', lineBreak: false });
    doc.text(
      `Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
      40, textY, { width: w - 80, align: 'center', lineBreak: false }
    );
    doc.text(`Page ${i - range.start + 1} of ${total}`, 40, textY, { width: w - 80, align: 'right', lineBreak: false });
  }
}

function statusBadge(doc, status, x, y) {
  if (!status) return;
  const key = String(status).toLowerCase();
  const [bg, fg] = STATUS_COLORS[key] || ['#f1f5f9', GRAY];
  const label = String(status).toUpperCase().replace(/_/g, ' ');
  doc.font('Helvetica-Bold').fontSize(8.5);
  const w = doc.widthOfString(label) + 16;
  doc.roundedRect(x, y, w, 16, 8).fill(bg);
  doc.fillColor(fg).text(label, x, y + 4, { width: w, align: 'center' });
  doc.fillColor(TEXT_DARK);
  return w;
}

// A bordered "meta info" card showing label/value pairs in a 2-column grid —
// used for the document summary block under the header (status, dates, refs).
// Pass `full: true` on an item (e.g. a long Description) to give it its own
// full-width row instead of squeezing it into half the card — that's what
// was truncating/crowding long bilingual descriptions against their neighbor.
function metaCard(doc, items, opts = {}) {
  const startX = opts.x ?? 40;
  const width = opts.width ?? doc.page.width - 80;
  const colWidth = width / 2;
  const rowHeight = 34;

  let row = 0, col = 0;
  const positions = items.map((item) => {
    if (item.full) {
      if (col !== 0) row += 1;
      const pos = { row, col: 0, span: 2 };
      row += 1;
      col = 0;
      return pos;
    }
    const pos = { row, col, span: 1 };
    col += 1;
    if (col > 1) { col = 0; row += 1; }
    return pos;
  });
  const totalRows = row + (col !== 0 ? 1 : 0) || 1;
  const cardHeight = totalRows * rowHeight + 14;
  const y0 = doc.y;

  doc.roundedRect(startX, y0, width, cardHeight, 6).fillAndStroke('#fafbfd', BORDER);

  items.forEach((item, idx) => {
    const pos = positions[idx];
    const cx = startX + 14 + pos.col * colWidth;
    const boxWidth = (pos.span === 2 ? width : colWidth) - 28;
    const labelY = y0 + 9 + pos.row * rowHeight;
    const valueY = labelY + 12;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY)
      .text(item.label.toUpperCase(), cx, labelY, { width: boxWidth, lineBreak: false });
    if (item.badge) {
      statusBadge(doc, item.value, cx, valueY - 2);
    } else {
      drawBidi(doc, item.value ?? '-', cx, valueY, { fontSize: 9.5, color: TEXT_DARK, bold: true, width: boxWidth });
    }
  });

  doc.y = y0 + cardHeight + 18;
}

// Three-column "Prepared by / Reviewed by / Approved by" signature strip —
// standard on printed accounting vouchers in this region. Purely a blank
// line + label; there's no e-signature capture in the app, so this is what
// gets physically signed once printed.
function signatureBlock(doc, labels = ['Prepared by', 'Reviewed by', 'Approved by']) {
  // If the table pushed doc.y close to the bottom margin, start a fresh page
  // rather than let the signature strip collide with (or run under) the footer.
  if (doc.y + 76 > doc.page.height - doc.page.margins.bottom) doc.addPage();

  const startX = 40;
  const width = doc.page.width - 80;
  const colWidth = width / labels.length;
  const y0 = doc.y + 20;
  const lineY = y0 + 30;

  labels.forEach((label, i) => {
    const cx = startX + i * colWidth;
    doc.moveTo(cx, lineY).lineTo(cx + colWidth - 24, lineY).lineWidth(0.75).strokeColor(BORDER).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text(label, cx, lineY + 6, { width: colWidth - 24, lineBreak: false });
  });

  doc.y = lineY + 26;
}

function table(doc, { headers, rows, colWidths, startX = 40 }) {
  const rowHeight = 24;
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  let y = doc.y;

  doc.roundedRect(startX, y, totalWidth, rowHeight, 4).fill(NAVY);
  doc.fillColor('#ffffff');
  let x = startX;
  headers.forEach((h, i) => {
    // Narrow columns (e.g. "DEDUCTION", "SICK LEAVE") can be wider than the column at
    // 8.5pt bold — PDFKit wraps to a second line whenever a `width` option is passed to
    // .text(), even with lineBreak:false. So: shrink the font to fit on one line, then
    // draw WITHOUT a width option at all (computing the align offset by hand instead,
    // the same trick drawBidi uses) — that's what actually keeps it on one line.
    const label = h.label.toUpperCase();
    const boxWidth = colWidths[i] - 16;
    const size = fitFontSize(doc, label, boxWidth, 'Helvetica-Bold', 8.5, 6);
    doc.font('Helvetica-Bold').fontSize(size);
    const textWidth = doc.widthOfString(label);
    const align = h.align || 'left';
    let textX = x + 8;
    if (align === 'right') textX = x + 8 + boxWidth - textWidth;
    else if (align === 'center') textX = x + 8 + (boxWidth - textWidth) / 2;
    doc.text(label, textX, y + (rowHeight - size) / 2 - 1, { lineBreak: false });
    x += colWidths[i];
  });
  y += rowHeight;

  if (rows.length === 0) {
    doc.rect(startX, y, totalWidth, rowHeight).fill(ROW_ALT);
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text('No records', startX + 8, y + 7, { width: totalWidth - 16, align: 'center', lineBreak: false });
    doc.moveTo(startX, y + rowHeight).lineTo(startX + totalWidth, y + rowHeight).lineWidth(0.5).strokeColor(BORDER).stroke();
    y += rowHeight;
  }

  doc.font('Helvetica').fontSize(9);
  rows.forEach((row, rIdx) => {
    if (y > doc.page.height - 90) {
      doc.addPage();
      y = 40;
    }
    if (rIdx % 2 === 1) doc.rect(startX, y, totalWidth, rowHeight).fill(ROW_ALT);
    x = startX;
    row.forEach((cell, i) => {
      drawBidi(doc, cell ?? '-', x + 8, y + 7, { fontSize: 9, color: TEXT_DARK, width: colWidths[i] - 16, align: headers[i]?.align || 'left' });
      x += colWidths[i];
    });
    doc.moveTo(startX, y + rowHeight).lineTo(startX + totalWidth, y + rowHeight).lineWidth(0.5).strokeColor(BORDER).stroke();
    y += rowHeight;
  });

  doc.y = y + 14;
}

// Right-aligned bordered box used for grand totals / net figures.
function totalsBox(doc, lines, opts = {}) {
  const width = opts.width ?? 240;
  const startX = doc.page.width - 40 - width;
  const rowH = 20;
  const y0 = doc.y + 4;
  const height = lines.length * rowH + 14;

  doc.roundedRect(startX, y0, width, height, 6).fillAndStroke('#fafbfd', BORDER);
  lines.forEach((line, i) => {
    const ly = y0 + 8 + i * rowH;
    const isLast = i === lines.length - 1;
    doc.font(isLast ? 'Helvetica-Bold' : 'Helvetica').fontSize(isLast ? 11 : 9.5)
      .fillColor(line.color || (isLast ? NAVY : TEXT_DARK));
    doc.text(line.label, startX + 12, ly, { width: width - 100, align: 'left' });
    doc.text(line.value, startX + 12, ly, { width: width - 24, align: 'right' });
  });
  doc.y = y0 + height + 10;
}

function sectionTitle(doc, text) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(text, 40, doc.y);
  doc.moveTo(40, doc.y + 2).lineTo(40 + doc.widthOfString(text) + 6, doc.y + 2).lineWidth(1.5).strokeColor(GOLD).stroke();
  doc.moveDown(0.6);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
function generateVoucherPdf(res, voucher, company) {
  const doc = newDoc(res, `${voucher.voucher_no}.pdf`);
  header(doc, company, voucher.voucher_no, `${voucher.voucher_type.toUpperCase()} VOUCHER`);

  metaCard(doc, [
    { label: 'Status', value: voucher.status, badge: true },
    { label: 'Date', value: voucher.date },
    { label: 'Currency', value: voucher.currency },
    { label: 'Description', value: voucher.description || '-', full: true },
  ]);

  table(doc, {
    headers: [
      { label: 'Account' }, { label: 'Cost Center' }, { label: 'Description' },
      { label: 'Debit', align: 'right' }, { label: 'Credit', align: 'right' },
    ],
    colWidths: [140, 100, 140, 70, 70],
    rows: voucher.lines.map((l) => [
      l.account ? `${l.account.code} - ${l.account.name_en}` : '-',
      l.costCenter ? l.costCenter.name_en : '-',
      l.description || '-',
      Number(l.debit) > 0 ? Number(l.debit).toFixed(3) : '',
      Number(l.credit) > 0 ? Number(l.credit).toFixed(3) : '',
    ]),
  });

  totalsBox(doc, [
    { label: 'Total Debit', value: `${Number(voucher.total_debit).toFixed(3)} ${voucher.currency}` },
    { label: 'Total Credit', value: `${Number(voucher.total_credit ?? voucher.total_debit).toFixed(3)} ${voucher.currency}`, color: NAVY },
  ]);

  signatureBlock(doc);
  footer(doc, company);
  doc.end();
}

function generateProfitAndLossPdf(res, data, company) {
  const doc = newDoc(res, `profit-and-loss-${data.period.from}-to-${data.period.to}.pdf`);
  header(doc, company, 'Profit & Loss', `Statement period ${data.period.from} to ${data.period.to}`);

  metaCard(doc, [
    { label: 'From', value: data.period.from },
    { label: 'To', value: data.period.to },
  ]);

  sectionTitle(doc, 'Revenue');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: data.revenue.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]),
  });

  sectionTitle(doc, 'Expenses');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: data.expense.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]),
  });

  totalsBox(doc, [
    { label: 'Total Revenue', value: data.total_revenue.toFixed(3) },
    { label: 'Total Expenses', value: data.total_expense.toFixed(3) },
    { label: 'Net Profit', value: data.net_profit.toFixed(3), color: data.net_profit >= 0 ? SUCCESS : DANGER },
  ], { width: 260 });

  footer(doc, company);
  doc.end();
}

function generateBalanceSheetPdf(res, data, company) {
  const doc = newDoc(res, `balance-sheet-${data.as_of}.pdf`);
  header(doc, company, 'Balance Sheet', `As of ${data.as_of}`);

  metaCard(doc, [
    { label: 'As of', value: data.as_of },
    { label: 'Status', value: data.is_balanced ? 'Balanced' : 'Out of Balance', badge: true },
  ]);

  sectionTitle(doc, 'Assets');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: data.assets.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]),
  });
  totalsBox(doc, [{ label: 'Total Assets', value: data.total_assets.toFixed(3) }], { width: 220 });

  sectionTitle(doc, 'Liabilities');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: data.liabilities.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]),
  });
  totalsBox(doc, [{ label: 'Total Liabilities', value: data.total_liabilities.toFixed(3) }], { width: 220 });

  sectionTitle(doc, 'Equity');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: [...data.equity.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]), ['Retained Earnings', data.retained_earnings.toFixed(3)]],
  });

  totalsBox(doc, [
    { label: 'Total Equity', value: data.total_equity.toFixed(3) },
    { label: data.is_balanced ? 'Balanced' : 'Out of Balance', value: '', color: data.is_balanced ? SUCCESS : DANGER },
  ], { width: 260 });

  footer(doc, company);
  doc.end();
}

function generateTrialBalancePdf(res, rows, asOf, company) {
  const doc = newDoc(res, `trial-balance${asOf ? '-' + asOf : ''}.pdf`);
  header(doc, company, 'Trial Balance', asOf ? `As of ${asOf}` : 'All dates');

  metaCard(doc, [{ label: 'As of', value: asOf || 'All dates' }, { label: 'Accounts', value: String(rows.length) }]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);

  table(doc, {
    headers: [{ label: 'Code' }, { label: 'Account' }, { label: 'Debit', align: 'right' }, { label: 'Credit', align: 'right' }],
    colWidths: [70, 290, 100, 100],
    rows: rows.map((r) => [r.account?.code, r.account?.name_en, Number(r.debit).toFixed(3), Number(r.credit).toFixed(3)]),
  });

  totalsBox(doc, [
    { label: 'Total Debit', value: totalDebit.toFixed(3) },
    { label: 'Total Credit', value: totalCredit.toFixed(3), color: NAVY },
  ]);

  footer(doc, company);
  doc.end();
}

function generateEmployeesPdf(res, rows, company) {
  const doc = newDoc(res, 'employees.pdf');
  header(doc, company, 'Employees', `${rows.length} records`);

  metaCard(doc, [{ label: 'Total Employees', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'Code' }, { label: 'Name' }, { label: 'Position' }, { label: 'Department' },
      { label: 'Salary', align: 'right' }, { label: 'Vacation', align: 'right' }, { label: 'Sick Leave', align: 'right' }, { label: 'Deduction', align: 'right' },
    ],
    colWidths: [65, 100, 65, 60, 62, 48, 50, 55],
    rows: rows.map((e) => [
      e.code, e.name_en, e.position || '-', e.department || '-',
      Number(e.salary || 0).toFixed(3), Number(e.vacation_balance || 0).toFixed(2), Number(e.sick_leave_balance || 0).toFixed(2), Number(e.deduction || 0).toFixed(3),
    ]),
  });

  footer(doc, company);
  doc.end();
}

function generateCostCentersPdf(res, rows, company) {
  const doc = newDoc(res, 'cost-centers.pdf');
  header(doc, company, 'Cost Centers', `${rows.length} records`);

  metaCard(doc, [{ label: 'Total Cost Centers', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'Code' }, { label: 'Name (EN)' }, { label: 'Name (AR)' },
      { label: 'Linked Account' }, { label: 'Status' },
    ],
    colWidths: [70, 130, 130, 130, 55],
    rows: rows.map((c) => [
      c.code, c.name_en, c.name_ar,
      c.account ? `${c.account.code} - ${c.account.name_en}` : '-',
      c.is_active ? 'Active' : 'Inactive',
    ]),
  });

  footer(doc, company);
  doc.end();
}

function generateCashAccountsPdf(res, rows, company) {
  const doc = newDoc(res, 'cash-control.pdf');
  header(doc, company, 'Cash Control', `${rows.length} records`);

  metaCard(doc, [{ label: 'Total Accounts', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'Name (EN)' }, { label: 'Name (AR)' }, { label: 'Type' },
      { label: 'Linked Account' }, { label: 'Bank' }, { label: 'Currency' },
    ],
    colWidths: [110, 110, 60, 130, 80, 55],
    rows: rows.map((c) => [
      c.name_en, c.name_ar, c.type.replace('_', ' '),
      c.account ? `${c.account.code} - ${c.account.name_en}` : '-',
      c.bank_name || '-', c.currency,
    ]),
  });

  footer(doc, company);
  doc.end();
}

function generateSuppliersPdf(res, rows, company) {
  const doc = newDoc(res, 'suppliers.pdf');
  header(doc, company, 'Suppliers', `${rows.length} records`);

  metaCard(doc, [{ label: 'Total Suppliers', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'Code' }, { label: 'Name' }, { label: 'Phone' },
      { label: 'Linked Account' }, { label: 'Balance', align: 'right' },
    ],
    colWidths: [65, 150, 90, 130, 70],
    rows: rows.map((s) => [
      s.code, s.name_en, s.phone || '-',
      s.account ? `${s.account.code} - ${s.account.name_en}` : '-',
      Number(s.opening_balance || 0).toFixed(3),
    ]),
  });

  footer(doc, company);
  doc.end();
}

function generateClientsPdf(res, rows, company) {
  const doc = newDoc(res, 'clients.pdf');
  header(doc, company, 'Clients', `${rows.length} records`);

  metaCard(doc, [{ label: 'Total Clients', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'Code' }, { label: 'Name' }, { label: 'Phone' },
      { label: 'Linked Account' }, { label: 'Balance', align: 'right' },
    ],
    colWidths: [65, 150, 90, 130, 70],
    rows: rows.map((c) => [
      c.code, c.name_en, c.phone || '-',
      c.account ? `${c.account.code} - ${c.account.name_en}` : '-',
      Number(c.opening_balance || 0).toFixed(3),
    ]),
  });

  footer(doc, company);
  doc.end();
}

function generateVehiclesPdf(res, rows, company) {
  const doc = newDoc(res, 'vehicles.pdf');
  header(doc, company, 'Vehicles', `${rows.length} records`);

  metaCard(doc, [{ label: 'Total Vehicles', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'Code' }, { label: 'Plate No.' }, { label: 'Make/Model' },
      { label: 'Type' }, { label: 'Driver' }, { label: 'Status' },
    ],
    colWidths: [65, 70, 110, 70, 100, 70],
    rows: rows.map((v) => [
      v.code, v.plate_no, `${v.make || ''} ${v.model || ''}`.trim() || '-',
      v.vehicle_type || '-', v.driver ? v.driver.name_en : '-',
      (v.status || '').charAt(0).toUpperCase() + (v.status || '').slice(1),
    ]),
  });

  footer(doc, company);
  doc.end();
}

function generateInvoicePdf(res, invoice, company) {
  const doc = newDoc(res, `${invoice.invoice_no}.pdf`);
  const partyName = invoice.type === 'sales' ? invoice.client?.name_en : invoice.supplier?.name_en;
  header(doc, company, invoice.invoice_no, `${invoice.type === 'sales' ? 'SALES INVOICE' : 'PURCHASE BILL'} · ${invoice.date}`);

  metaCard(doc, [
    { label: invoice.type === 'sales' ? 'Bill To' : 'Vendor', value: partyName || '-' },
    { label: 'Status', value: invoice.status, badge: true },
    { label: 'Due Date', value: invoice.due_date || '-' },
    { label: 'Reference', value: invoice.reference_no || '-' },
  ]);

  table(doc, {
    headers: [
      { label: 'Description' }, { label: 'Qty', align: 'right' }, { label: 'Unit Price', align: 'right' },
      { label: 'Tax %', align: 'right' }, { label: 'Total', align: 'right' },
    ],
    colWidths: [220, 50, 80, 60, 90],
    rows: invoice.lines.map((l) => [
      l.description || '-',
      Number(l.quantity).toFixed(2),
      Number(l.unit_price).toFixed(3),
      Number(l.tax_rate).toFixed(1),
      Number(l.line_total).toFixed(3),
    ]),
  });

  const balanceDue = Number(invoice.total) - Number(invoice.paid_total);
  totalsBox(doc, [
    { label: 'Subtotal', value: Number(invoice.subtotal).toFixed(3) },
    { label: 'Tax', value: Number(invoice.tax_total).toFixed(3) },
    { label: 'Total', value: `${Number(invoice.total).toFixed(3)} ${invoice.currency}` },
    { label: 'Paid', value: Number(invoice.paid_total).toFixed(3) },
    { label: 'Balance Due', value: balanceDue.toFixed(3), color: balanceDue > 0.001 ? DANGER : SUCCESS },
  ], { width: 260 });

  if (invoice.notes) {
    drawBidi(doc, `Notes: ${invoice.notes}`, 40, doc.y, { fontSize: 9, color: GRAY, width: doc.page.width - 80 });
    doc.moveDown(1);
  }

  footer(doc, company);
  doc.end();
}

function generateAgingPdf(res, aging, company) {
  const label = aging.type === 'sales' ? 'Accounts Receivable Aging' : 'Accounts Payable Aging';
  const doc = newDoc(res, `${aging.type}-aging-${aging.as_of}.pdf`);
  header(doc, company, label, `As of ${aging.as_of}`);

  metaCard(doc, [
    { label: 'As of', value: aging.as_of },
    { label: 'Total Outstanding', value: aging.total_outstanding.toFixed(3) },
  ]);

  table(doc, {
    headers: [
      { label: 'Invoice' }, { label: aging.type === 'sales' ? 'Client' : 'Supplier' }, { label: 'Due Date' },
      { label: 'Outstanding', align: 'right' }, { label: 'Days Overdue', align: 'right' }, { label: 'Bucket' },
    ],
    colWidths: [80, 150, 70, 90, 80, 60],
    rows: aging.rows.map((r) => [r.invoice_no, r.party || '-', r.due_date || '-', r.outstanding.toFixed(3), String(r.days_overdue), r.bucket]),
  });

  sectionTitle(doc, 'Summary by Age Bucket');
  totalsBox(doc, [
    ...Object.entries(aging.buckets).map(([bucket, amount]) => ({ label: bucket, value: amount.toFixed(3) })),
    { label: 'Total Outstanding', value: aging.total_outstanding.toFixed(3), color: NAVY },
  ], { width: 260 });

  footer(doc, company);
  doc.end();
}

module.exports = {
  generateVoucherPdf, generateProfitAndLossPdf, generateBalanceSheetPdf, generateTrialBalancePdf,
  generateInvoicePdf, generateAgingPdf, generateEmployeesPdf,
  generateCostCentersPdf, generateCashAccountsPdf, generateSuppliersPdf, generateClientsPdf,
  generateVehiclesPdf,
};
