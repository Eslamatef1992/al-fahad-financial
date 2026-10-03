const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { amountInWordsEn, amountInWordsAr } = require('./numberToWords');

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

// Word-wraps a PURE-Arabic paragraph (no mixed script) to `width`, in
// logical (reading) order, returning an array of lines where each line is an
// array of words. PDFKit's own .text()/.heightOfString() wrapping cannot be
// used directly for Arabic: it lays out words in the string's storage
// (logical) order left-to-right, which is backwards for RTL — same root
// cause drawBidi works around for single-line cells, but drawBidi never
// wraps. This + drawArabicLines below do the equivalent for a multi-line
// paragraph: wrap in logical order, then reverse each line's word order
// before drawing it so it reads visually right-to-left.
// A plain space character between two Arabic glyph clusters renders with
// (near-)zero advance width through PDFKit/fontkit's shaping path here —
// words end up glued together ("مائةوثمانون" instead of "مائة وثمانون").
// Fix: never feed a multi-word Arabic string through doc.text() as one
// string. Measure/draw word-by-word and add this gap ourselves.
function arabicSpaceWidth(doc, fontSize) {
  return fontSize * 0.28;
}

function wrapArabicLines(doc, text, width, fontSize, bold) {
  const font = bold ? 'Arabic-Bold' : 'Arabic';
  doc.font(font).fontSize(fontSize);
  const gap = arabicSpaceWidth(doc, fontSize);
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = [];
  let currentWidth = 0;
  words.forEach((w) => {
    const wWidth = doc.widthOfString(w);
    const candidateWidth = current.length ? currentWidth + gap + wWidth : wWidth;
    if (current.length && candidateWidth > width) {
      lines.push(current);
      current = [w];
      currentWidth = wWidth;
    } else {
      current.push(w);
      currentWidth = candidateWidth;
    }
  });
  if (current.length) lines.push(current);
  return lines;
}

// Draws lines produced by wrapArabicLines (each line's words reversed so the
// visual order reads right-to-left, right-aligned within `width`), placing
// each word at an explicitly computed x position rather than drawing the
// whole line as one string — see arabicSpaceWidth above. Returns the total
// height consumed.
function drawArabicLines(doc, lines, x, y, width, fontSize, bold, color) {
  const font = bold ? 'Arabic-Bold' : 'Arabic';
  doc.font(font).fontSize(fontSize);
  if (color) doc.fillColor(color);
  const gap = arabicSpaceWidth(doc, fontSize);
  const lineHeight = fontSize * 1.4;
  lines.forEach((lineWords, i) => {
    const visualWords = [...lineWords].reverse();
    const wordWidths = visualWords.map((w) => doc.widthOfString(w));
    const totalWidth = wordWidths.reduce((a, b) => a + b, 0) + gap * (visualWords.length - 1);
    const ly = y + i * lineHeight;
    let cx = x + width - totalWidth;
    visualWords.forEach((w, idx) => {
      doc.text(w, cx, ly, { lineBreak: false });
      cx += wordWidths[idx] + gap;
    });
  });
  doc.fillColor('#000000');
  return lines.length * lineHeight;
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
    const fontSize = isLast ? 11 : 9.5;
    const color = line.color || (isLast ? NAVY : TEXT_DARK);
    drawBidi(doc, line.label, startX + 12, ly, { width: width - 100, align: 'left', fontSize, color, bold: isLast });
    drawBidi(doc, line.value, startX + 12, ly, { width: width - 24, align: 'right', fontSize, color, bold: isLast });
  });
  doc.y = y0 + height + 10;
}

// Full-width bordered box showing the bilingual "amount in words" sentence
// (the classic "One Hundred Eighty Kuwaiti Dinars Only" / Arabic equivalent
// printed on invoices and cheques). Uses plain wrapping text per language
// (not drawBidi, which never wraps) since each line here is pure single-script
// text — PDFKit's native wrap + fontkit shaping handles that correctly on its own.
function amountInWordsBox(doc, enText, arText) {
  const startX = 40;
  const width = doc.page.width - 80;
  const innerWidth = width - 24;
  const y0 = doc.y;

  doc.font('Helvetica-Bold').fontSize(9.5);
  const enHeight = doc.heightOfString(enText, { width: innerWidth });
  const hasArabicFonts = registerArabicFonts(doc);
  const arLines = hasArabicFonts ? wrapArabicLines(doc, arText, innerWidth, 9.5, true) : [];
  const arHeight = arLines.length * (9.5 * 1.4);
  const height = 20 + enHeight + (hasArabicFonts ? 6 + arHeight : 0) + 10;

  doc.roundedRect(startX, y0, width, height, 6).fillAndStroke('#fafbfd', BORDER);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY).text('AMOUNT IN WORDS', startX + 12, y0 + 8, { lineBreak: false });

  let cy = y0 + 20;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT_DARK).text(enText, startX + 12, cy, { width: innerWidth });
  cy += enHeight + 6;

  if (hasArabicFonts) {
    drawArabicLines(doc, arLines, startX + 12, cy, innerWidth, 9.5, true, TEXT_DARK);
  }

  doc.fillColor('#000000');
  doc.y = y0 + height + 14;
}

// Full-width "Notes" box — always printed (not just when notes text exists)
// so there's a ruled area left for the client/driver to write something by
// hand after the invoice is printed, exactly like the blank space at the
// bottom of a paper invoice pad.
function notesBox(doc, notes) {
  const startX = 40;
  const width = doc.page.width - 80;
  const innerWidth = width - 24;
  const y0 = doc.y;
  const topPad = 20;
  const blankLines = 3;
  const lineGap = 16;

  const hasArabic = notes && ARABIC_RE.test(notes);
  const useArabicWrap = hasArabic && registerArabicFonts(doc);
  let textHeight = 0;
  let arNoteLines = [];
  if (notes) {
    if (useArabicWrap) {
      arNoteLines = wrapArabicLines(doc, notes, innerWidth, 9, false);
      textHeight = arNoteLines.length * (9 * 1.4);
    } else {
      doc.font('Helvetica').fontSize(9);
      textHeight = doc.heightOfString(notes, { width: innerWidth });
    }
  }
  const height = topPad + textHeight + (notes ? 8 : 0) + blankLines * lineGap + 6;

  doc.roundedRect(startX, y0, width, height, 6).fillAndStroke('#fafbfd', BORDER);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY).text('NOTES', startX + 12, y0 + 8, { lineBreak: false });

  let cy = y0 + topPad;
  if (notes) {
    if (useArabicWrap) {
      drawArabicLines(doc, arNoteLines, startX + 12, cy, innerWidth, 9, false, TEXT_DARK);
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_DARK).text(notes, startX + 12, cy, { width: innerWidth });
    }
    cy += textHeight + 8;
  }

  for (let i = 0; i < blankLines; i++) {
    const ly = cy + i * lineGap + 10;
    doc.moveTo(startX + 12, ly).lineTo(startX + width - 12, ly).lineWidth(0.5).strokeColor(BORDER).stroke();
  }

  doc.fillColor('#000000');
  doc.y = y0 + height + 14;
}

// Bilingual goods-receipt acknowledgment block, modeled on the standard
// Kuwaiti paper delivery-note pad: a signed statement that the goods were
// received in good condition, the recipient's name/date, and three signature
// lines (Buyer / Seller / Warehouse Keeper). Used on sales invoices in place
// of the generic signatureBlock().
function acknowledgmentBlock(doc, labels) {
  if (doc.y + 150 > doc.page.height - doc.page.margins.bottom) doc.addPage();

  const startX = 40;
  const width = doc.page.width - 80;
  const y0 = doc.y + 6;

  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRAY)
    .text('I, the undersigned, acknowledge receipt of the above goods in good condition.', startX, y0, { width: width / 2 - 10 });
  if (registerArabicFonts(doc)) {
    const arStatementWidth = width / 2 - 10;
    const arStatementLines = wrapArabicLines(doc, 'أقر أنا الموقع أدناه باستلام البضاعة أعلاه بحالة جيدة', arStatementWidth, 9, false);
    drawArabicLines(doc, arStatementLines, startX + width / 2 + 10, y0, arStatementWidth, 9, false, GRAY);
  }
  doc.fillColor(TEXT_DARK);

  // Row: Recipient Name / Date / Time
  const row1Y = y0 + 26;
  const fields = [
    { label: 'Recipient Name', width: width * 0.4 },
    { label: 'Date', width: width * 0.3 },
    { label: 'Time', width: width * 0.3 },
  ];
  let fx = startX;
  fields.forEach((f) => {
    const lineY = row1Y + 16;
    doc.moveTo(fx, lineY).lineTo(fx + f.width - 16, lineY).lineWidth(0.75).strokeColor(BORDER).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(f.label, fx, lineY + 4, { width: f.width - 16, lineBreak: false });
    fx += f.width;
  });

  // Row: signature lines
  const row2Y = row1Y + 48;
  const colWidth = width / labels.length;
  const lineY2 = row2Y + 30;
  labels.forEach((label, i) => {
    const cx = startX + i * colWidth;
    doc.moveTo(cx, lineY2).lineTo(cx + colWidth - 24, lineY2).lineWidth(0.75).strokeColor(BORDER).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text(label, cx, lineY2 + 6, { width: colWidth - 24, lineBreak: false });
  });

  doc.y = lineY2 + 26;
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
    ...(voucher.branch ? [{ label: 'Branch', value: `${voucher.branch.code} - ${voucher.branch.name_en}` }] : []),
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
  const party = invoice.type === 'sales' ? invoice.client : invoice.supplier;
  const partyName = party?.name_en;
  header(doc, company, invoice.invoice_no, `${invoice.type === 'sales' ? 'SALES INVOICE' : 'PURCHASE BILL'} · ${invoice.date}`);

  // Payment Method: which Payment Setting Option(s) actually settled this
  // invoice, if any payment has been recorded yet (blank/omitted otherwise —
  // exactly like the blank line on a paper invoice waiting to be filled in).
  const paymentMethodLabels = invoice.payments?.length
    ? [...new Set(invoice.payments.map((p) => p.payment_method).filter(Boolean))].join(', ')
    : null;

  metaCard(doc, [
    { label: invoice.type === 'sales' ? 'Bill To' : 'Vendor', value: partyName || '-' },
    { label: 'Status', value: invoice.status, badge: true },
    { label: 'Due Date', value: invoice.due_date || '-' },
    { label: 'Reference', value: invoice.reference_no || '-' },
    ...(party?.phone ? [{ label: 'Phone', value: party.phone }] : []),
    ...(invoice.branch ? [{ label: 'Branch', value: `${invoice.branch.code} - ${invoice.branch.name_en}` }] : []),
    ...(invoice.delivery_date ? [{ label: 'Delivery Date', value: invoice.delivery_date }] : []),
    ...(paymentMethodLabels ? [{ label: 'Payment Method', value: paymentMethodLabels }] : []),
    ...(invoice.creator?.name ? [{ label: 'Salesperson', value: invoice.creator.name }] : []),
    { label: invoice.type === 'sales' ? 'Client Address' : 'Supplier Address', value: party?.address || invoice.delivery_address || '-', full: true },
  ]);

  if (invoice.delivery_address) {
    drawBidi(doc, `Delivery Address: ${invoice.delivery_address}`, 40, doc.y, { fontSize: 9, color: GRAY, width: doc.page.width - 80 });
    doc.moveDown(0.5);
  }

  table(doc, {
    headers: [
      { label: 'No.', align: 'center' }, { label: 'SKU' }, { label: 'Description' }, { label: 'Qty', align: 'right' },
      { label: 'Unit Price', align: 'right' }, { label: 'Total', align: 'right' },
    ],
    colWidths: [30, 70, 150, 50, 90, 110],
    rows: invoice.lines.map((l, i) => [
      String(i + 1),
      l.variant?.sku || l.item?.sku || '-',
      l.description || '-',
      Number(l.quantity).toFixed(2),
      Number(l.unit_price).toFixed(3),
      Number(l.line_total).toFixed(3),
    ]),
  });

  const balanceDue = Number(invoice.total) - Number(invoice.paid_total);
  const discountAmount = Number(invoice.discount_amount || 0);
  totalsBox(doc, [
    { label: 'Subtotal', value: Number(invoice.subtotal).toFixed(3) },
    ...(discountAmount > 0.0009 ? [{ label: `Discount${invoice.discountCode ? ` (${invoice.discountCode.code})` : ''}`, value: `-${discountAmount.toFixed(3)}`, color: DANGER }] : []),
    { label: 'Total', value: `${Number(invoice.total).toFixed(3)} ${invoice.currency}` },
    { label: 'Paid', value: Number(invoice.paid_total).toFixed(3) },
    { label: 'Balance Due', value: balanceDue.toFixed(3), color: balanceDue > 0.001 ? DANGER : SUCCESS },
  ], { width: 260 });

  amountInWordsBox(
    doc,
    amountInWordsEn(Number(invoice.total), invoice.currency),
    amountInWordsAr(Number(invoice.total), invoice.currency),
  );

  notesBox(doc, invoice.notes);

  acknowledgmentBlock(doc, ['Buyer Signature', 'Seller Signature', 'Warehouse Keeper Signature']);

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

function generateItemsPdf(res, rows, company) {
  const doc = newDoc(res, 'items.pdf');
  header(doc, company, 'Inventory Items', `${rows.length} records`);

  const qtyOf = (r) => Number(r.total_quantity_on_hand ?? r.quantity_on_hand);
  const valueOf = (r) => Number(r.total_value ?? (Number(r.quantity_on_hand) * Number(r.cost_price)));
  const totalValue = rows.reduce((s, r) => s + valueOf(r), 0);
  metaCard(doc, [
    { label: 'Total Items', value: String(rows.length) },
    { label: 'Total Stock Value', value: totalValue.toFixed(3) },
  ]);

  table(doc, {
    headers: [
      { label: 'Code' }, { label: 'SKU' }, { label: 'Name' }, { label: 'Unit' },
      { label: 'Qty on Hand', align: 'right' }, { label: 'Value', align: 'right' }, { label: 'Selling Price', align: 'right' },
    ],
    colWidths: [55, 65, 130, 40, 65, 65, 65],
    rows: rows.map((it) => [
      it.code, it.sku || '-', it.name_en, it.unit,
      qtyOf(it).toFixed(2),
      valueOf(it).toFixed(3),
      Number(it.selling_price).toFixed(3),
    ]),
  });

  totalsBox(doc, [{ label: 'Total Stock Value', value: totalValue.toFixed(3) }], { width: 240 });

  footer(doc, company);
  doc.end();
}

// rows are StockTransfer headers, each with a .lines array (item/variant/qty)
// — mirrors an invoice with multiple lines, so one PDF row per line.
function generateStockTransfersPdf(res, rows, company) {
  const doc = newDoc(res, 'stock-transfers.pdf');
  header(doc, company, 'Stock Transfers', `${rows.length} records`);

  metaCard(doc, [{ label: 'Total Transfers', value: String(rows.length) }]);

  const locationLabel = (branch) => (branch ? `${branch.code} - ${branch.name_en}` : 'Unbranched');
  const tableRows = [];
  rows.forEach((r) => {
    (r.lines || []).forEach((l) => {
      tableRows.push([
        r.transfer_no, r.date,
        l.item ? `${l.item.code} - ${l.item.name_en}${l.variant ? ` (${l.variant.sku})` : ''}` : '-',
        locationLabel(r.fromBranch), locationLabel(r.toBranch),
        Number(l.quantity).toFixed(2), Number(l.unit_cost).toFixed(3),
      ]);
    });
  });

  table(doc, {
    headers: [
      { label: 'Transfer No.' }, { label: 'Date' }, { label: 'Item' },
      { label: 'From' }, { label: 'To' }, { label: 'Qty', align: 'right' }, { label: 'Unit Cost', align: 'right' },
    ],
    colWidths: [75, 60, 110, 90, 90, 55, 65],
    rows: tableRows,
  });

  footer(doc, company);
  doc.end();
}

function generateItemVariantsPdf(res, item, rows, company) {
  const doc = newDoc(res, `item-variants-${item.code}.pdf`);
  header(doc, company, `${item.name_en} — Variants`, `${rows.length} records`);

  metaCard(doc, [{ label: 'Item Code', value: item.code }, { label: 'Variants', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'SKU' }, { label: 'Attributes' }, { label: 'Qty on Hand', align: 'right' },
      { label: 'Avg Cost', align: 'right' }, { label: 'Value', align: 'right' }, { label: 'Status' },
    ],
    colWidths: [80, 170, 65, 60, 65, 50],
    rows: rows.map((v) => {
      const qty = Number(v.total_quantity_on_hand ?? v.quantity_on_hand);
      const value = v.total_value !== undefined ? Number(v.total_value) : qty * Number(v.cost_price);
      return [
        v.sku, Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(', '),
        qty.toFixed(2), Number(v.cost_price).toFixed(3), value.toFixed(3),
        v.is_active ? 'Active' : 'Inactive',
      ];
    }),
  });

  footer(doc, company);
  doc.end();
}

// rows are sales Invoices with delivery_date set, one row per invoice
// (regardless of how many lines it has) — the schedule is about the trip,
// not the line items, so a driver working from this printout sees exactly
// one stop per delivery.
function generateDeliverySchedulePdf(res, rows, company) {
  const doc = newDoc(res, 'delivery-schedule.pdf');
  header(doc, company, 'Delivery Schedule', `${rows.length} deliveries`);

  metaCard(doc, [{ label: 'Deliveries', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'Delivery Date' }, { label: 'Invoice' }, { label: 'Client' }, { label: 'Phone' },
      { label: 'Address' }, { label: 'Total', align: 'right' }, { label: 'Status' },
    ],
    colWidths: [65, 70, 100, 70, 130, 60, 55],
    rows: rows.map((inv) => [
      inv.delivery_date || '-',
      inv.invoice_no,
      inv.client?.name_en || '-',
      inv.client?.phone || '-',
      inv.delivery_address || inv.client?.address || '-',
      Number(inv.total).toFixed(3),
      inv.status,
    ]),
  });

  footer(doc, company);
  doc.end();
}

function generateStockValuationPdf(res, rows, company, locationLabel) {
  const doc = newDoc(res, 'stock-valuation.pdf');
  header(doc, company, 'Stock Valuation Report', locationLabel);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  metaCard(doc, [
    { label: 'Line Items', value: String(rows.length) },
    { label: 'Total Value', value: totalValue.toFixed(3) },
  ]);

  table(doc, {
    headers: [
      { label: 'Code' }, { label: 'Item' }, { label: 'Variant' },
      { label: 'Qty', align: 'right' }, { label: 'Avg Cost', align: 'right' }, { label: 'Value', align: 'right' },
    ],
    colWidths: [55, 150, 110, 55, 60, 65],
    rows: rows.map((r) => [
      r.code, r.name_en,
      r.variant_id ? (r.sku + (Object.keys(r.attributes || {}).length ? ` (${Object.entries(r.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')})` : '')) : '-',
      Number(r.quantity_on_hand).toFixed(2), Number(r.cost_price).toFixed(3), Number(r.value).toFixed(3),
    ]),
  });

  totalsBox(doc, [{ label: 'Total Value', value: totalValue.toFixed(3) }], { width: 240 });
  footer(doc, company);
  doc.end();
}

function generateLowStockPdf(res, rows, company, locationLabel) {
  const doc = newDoc(res, 'low-stock.pdf');
  header(doc, company, 'Low Stock / Reorder Report', locationLabel);

  metaCard(doc, [{ label: 'Items Below Reorder Level', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'Code' }, { label: 'Item' }, { label: 'Variant' },
      { label: 'Qty on Hand', align: 'right' }, { label: 'Reorder Level', align: 'right' },
    ],
    colWidths: [55, 160, 130, 70, 75],
    rows: rows.map((r) => [
      r.code, r.name_en,
      r.variant_id ? r.sku : '-',
      Number(r.quantity_on_hand).toFixed(2), Number(r.reorder_level).toFixed(2),
    ]),
  });

  footer(doc, company);
  doc.end();
}

function generateStockMovementPdf(res, item, rows, company) {
  const doc = newDoc(res, `stock-movement-${item.code}.pdf`);
  header(doc, company, `${item.name_en} — Stock Movement`, `${rows.length} records`);

  metaCard(doc, [{ label: 'Item Code', value: item.code }, { label: 'Movements', value: String(rows.length) }]);

  table(doc, {
    headers: [
      { label: 'Date' }, { label: 'Type' }, { label: 'Qty', align: 'right' },
      { label: 'Unit Cost', align: 'right' }, { label: 'Balance Qty', align: 'right' }, { label: 'Balance Value', align: 'right' },
    ],
    colWidths: [65, 90, 65, 65, 70, 75],
    rows: rows.map((r) => [
      r.date, r.type, Number(r.quantity).toFixed(2), Number(r.unit_cost).toFixed(3),
      Number(r.balance_qty_after).toFixed(2), Number(r.balance_value_after).toFixed(3),
    ]),
  });

  footer(doc, company);
  doc.end();
}

function generateSoldByClientPdf(res, rows, company, { from, to } = {}) {
  const doc = newDoc(res, 'sold-items-per-client.pdf');
  const period = from || to ? `${from || '...'} to ${to || '...'}` : 'All dates';
  header(doc, company, 'Sold Items Per Client', period);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalQty = rows.reduce((s, r) => s + r.quantity_sold, 0);
  metaCard(doc, [
    { label: 'Rows', value: String(rows.length) },
    { label: 'Total Qty Sold', value: totalQty.toFixed(2) },
    { label: 'Total Revenue', value: totalRevenue.toFixed(3) },
  ]);

  table(doc, {
    headers: [
      { label: 'Client' }, { label: 'Item' }, { label: 'SKU' },
      { label: 'Qty Sold', align: 'right' }, { label: 'Revenue', align: 'right' }, { label: 'Invoices', align: 'right' },
    ],
    colWidths: [130, 150, 70, 60, 75, 55],
    rows: rows.map((r) => [
      r.client_name, r.item_name, r.sku || '-',
      Number(r.quantity_sold).toFixed(2), Number(r.revenue).toFixed(3), String(r.invoice_count),
    ]),
  });

  totalsBox(doc, [
    { label: 'Total Qty Sold', value: totalQty.toFixed(2) },
    { label: 'Total Revenue', value: totalRevenue.toFixed(3) },
  ], { width: 240 });

  footer(doc, company);
  doc.end();
}

function generatePurchaseOrderPdf(res, po, company) {
  const doc = newDoc(res, `${po.po_no}.pdf`);
  header(doc, company, po.po_no, `PURCHASE ORDER · ${po.date}`);

  metaCard(doc, [
    { label: 'Supplier', value: po.supplier?.name_en || '-' },
    { label: 'Status', value: po.status, badge: true },
    { label: 'Expected Date', value: po.expected_date || '-' },
    { label: 'Currency', value: po.currency },
    ...(po.branch ? [{ label: 'Branch', value: `${po.branch.code} - ${po.branch.name_en}` }] : []),
  ]);

  table(doc, {
    headers: [
      { label: 'Description' }, { label: 'Qty', align: 'right' }, { label: 'Unit Price', align: 'right' },
      { label: 'Tax %', align: 'right' }, { label: 'Total', align: 'right' },
    ],
    colWidths: [220, 50, 80, 60, 90],
    rows: po.lines.map((l) => [
      l.item ? `${l.item.name_en}${l.description ? ' - ' + l.description : ''}` : (l.description || '-'),
      Number(l.quantity).toFixed(2),
      Number(l.unit_price).toFixed(3),
      Number(l.tax_rate).toFixed(1),
      Number(l.line_total).toFixed(3),
    ]),
  });

  totalsBox(doc, [
    { label: 'Subtotal', value: Number(po.subtotal).toFixed(3) },
    { label: 'Tax', value: Number(po.tax_total).toFixed(3) },
    { label: 'Total', value: `${Number(po.total).toFixed(3)} ${po.currency}` },
  ], { width: 240 });

  if (po.notes) {
    drawBidi(doc, `Notes: ${po.notes}`, 40, doc.y, { fontSize: 9, color: GRAY, width: doc.page.width - 80 });
    doc.moveDown(1);
  }

  signatureBlock(doc);
  footer(doc, company);
  doc.end();
}

function generateBranchesPdf(res, rows, company) {
  const doc = newDoc(res, 'branches.pdf');
  header(doc, company, 'Branches', `${rows.length} records`);

  metaCard(doc, [{ label: 'Total Branches', value: String(rows.length) }]);

  table(doc, {
    headers: [{ label: 'Code' }, { label: 'Name (EN)' }, { label: 'Name (AR)' }, { label: 'Linked Accounts' }, { label: 'Status' }],
    colWidths: [55, 110, 110, 175, 65],
    rows: rows.map((b) => [
      b.code, b.name_en, b.name_ar,
      (b.accounts || []).map((a) => `${a.code} - ${a.name_en}`).join(', ') || '-',
      b.is_active ? 'Active' : 'Inactive',
    ]),
  });

  footer(doc, company);
  doc.end();
}

module.exports = {
  generateVoucherPdf, generateProfitAndLossPdf, generateBalanceSheetPdf, generateTrialBalancePdf,
  generateInvoicePdf, generateAgingPdf, generateEmployeesPdf,
  generateCostCentersPdf, generateCashAccountsPdf, generateSuppliersPdf, generateClientsPdf,
  generateVehiclesPdf, generateItemsPdf, generatePurchaseOrderPdf, generateBranchesPdf,
  generateStockTransfersPdf, generateItemVariantsPdf, generateStockValuationPdf, generateLowStockPdf, generateStockMovementPdf,
  generateSoldByClientPdf, generateDeliverySchedulePdf,
};
