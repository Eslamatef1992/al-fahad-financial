const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const NAVY = '#1f2d4e';
const GOLD = '#c9a227';
const GRAY = '#64748b';

function newDoc(res, filename) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
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

function header(doc, company, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);

  const logoPath = resolveLogoPath(company);
  let textStartX = 40;
  if (logoPath) {
    try {
      doc.image(logoPath, 40, 20, { fit: [50, 50] });
      textStartX = 100;
    } catch (e) { /* corrupt/unsupported image — fall back to text-only header */ }
  }

  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text(company?.name_en || 'Al Fahad Group', textStartX, 28);
  doc.fontSize(10).font('Helvetica').fillColor(GOLD).text(company?.name_ar || '', textStartX, 50, { align: 'left' });
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#ffffff').text(title, 40, 28, { align: 'right', width: doc.page.width - 80 });
  if (subtitle) doc.fontSize(10).font('Helvetica').fillColor('#d7deec').text(subtitle, 40, 50, { align: 'right', width: doc.page.width - 80 });
  doc.moveDown(4);
  doc.fillColor('#000000');
  doc.y = 110;
}

function footer(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(GRAY).text(
      `Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} — Al Fahad Group Financial System`,
      40, doc.page.height - 40, { align: 'center', width: doc.page.width - 80 }
    );
  }
}

function table(doc, { headers, rows, colWidths, startX = 40 }) {
  const rowHeight = 22;
  let y = doc.y + 10;

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
  doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(NAVY);
  let x = startX;
  headers.forEach((h, i) => {
    doc.fillColor('#ffffff').text(h.label, x + 6, y + 6, { width: colWidths[i] - 12, align: h.align || 'left' });
    x += colWidths[i];
  });
  y += rowHeight;

  doc.font('Helvetica').fontSize(9);
  rows.forEach((row, rIdx) => {
    if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
    if (rIdx % 2 === 0) doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#f8fafc');
    x = startX;
    row.forEach((cell, i) => {
      doc.fillColor('#1e293b').text(String(cell ?? ''), x + 6, y + 6, { width: colWidths[i] - 12, align: headers[i]?.align || 'left' });
      x += colWidths[i];
    });
    y += rowHeight;
  });
  doc.y = y + 10;
}

function generateVoucherPdf(res, voucher, company) {
  const doc = newDoc(res, `${voucher.voucher_no}.pdf`);
  header(doc, company, voucher.voucher_no, `${voucher.voucher_type.toUpperCase()} VOUCHER · ${voucher.date}`);

  doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
  doc.text(`Status: ${voucher.status.toUpperCase()}`, 40, 120);
  doc.text(`Description: ${voucher.description || '-'}`, 40, 138);

  doc.y = 165;
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

  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
    .text(`Total: ${Number(voucher.total_debit).toFixed(3)} ${voucher.currency}`, 40, doc.y + 5, { align: 'right', width: doc.page.width - 80 });

  footer(doc);
  doc.end();
}

function generateProfitAndLossPdf(res, data, company) {
  const doc = newDoc(res, `profit-and-loss-${data.period.from}-to-${data.period.to}.pdf`);
  header(doc, company, 'Profit & Loss Statement', `${data.period.from} to ${data.period.to}`);

  doc.y = 120;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Revenue');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: data.revenue.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]),
  });
  doc.font('Helvetica-Bold').fontSize(10).text(`Total Revenue: ${data.total_revenue.toFixed(3)}`, { align: 'right' });

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Expenses');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: data.expense.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]),
  });
  doc.font('Helvetica-Bold').fontSize(10).text(`Total Expenses: ${data.total_expense.toFixed(3)}`, { align: 'right' });

  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(data.net_profit >= 0 ? '#059669' : '#dc2626')
    .text(`Net Profit: ${data.net_profit.toFixed(3)}`, { align: 'right' });

  footer(doc);
  doc.end();
}

function generateBalanceSheetPdf(res, data, company) {
  const doc = newDoc(res, `balance-sheet-${data.as_of}.pdf`);
  header(doc, company, 'Balance Sheet', `As of ${data.as_of}`);

  doc.y = 120;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Assets');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: data.assets.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]),
  });
  doc.font('Helvetica-Bold').fontSize(10).text(`Total Assets: ${data.total_assets.toFixed(3)}`, { align: 'right' });

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Liabilities');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: data.liabilities.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]),
  });
  doc.font('Helvetica-Bold').fontSize(10).text(`Total Liabilities: ${data.total_liabilities.toFixed(3)}`, { align: 'right' });

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Equity');
  table(doc, {
    headers: [{ label: 'Account' }, { label: 'Amount', align: 'right' }],
    colWidths: [380, 100],
    rows: [...data.equity.map((r) => [`${r.code} - ${r.name_en}`, r.amount.toFixed(3)]), ['Retained Earnings', data.retained_earnings.toFixed(3)]],
  });
  doc.font('Helvetica-Bold').fontSize(10).text(`Total Equity: ${data.total_equity.toFixed(3)}`, { align: 'right' });

  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(data.is_balanced ? '#059669' : '#dc2626')
    .text(data.is_balanced ? 'Balanced' : 'Out of balance — review entries', { align: 'right' });

  footer(doc);
  doc.end();
}

function generateTrialBalancePdf(res, rows, asOf, company) {
  const doc = newDoc(res, `trial-balance${asOf ? '-' + asOf : ''}.pdf`);
  header(doc, company, 'Trial Balance', asOf ? `As of ${asOf}` : 'All dates');

  doc.y = 120;
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);

  table(doc, {
    headers: [{ label: 'Code' }, { label: 'Account' }, { label: 'Debit', align: 'right' }, { label: 'Credit', align: 'right' }],
    colWidths: [70, 290, 100, 100],
    rows: rows.map((r) => [r.account?.code, r.account?.name_en, Number(r.debit).toFixed(3), Number(r.credit).toFixed(3)]),
  });

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b')
    .text(`Totals:   Debit ${totalDebit.toFixed(3)}    Credit ${totalCredit.toFixed(3)}`, { align: 'right' });

  footer(doc);
  doc.end();
}

function generateInvoicePdf(res, invoice, company) {
  const doc = newDoc(res, `${invoice.invoice_no}.pdf`);
  const partyName = invoice.type === 'sales' ? invoice.client?.name_en : invoice.supplier?.name_en;
  header(doc, company, invoice.invoice_no, `${invoice.type === 'sales' ? 'SALES INVOICE' : 'PURCHASE BILL'} · ${invoice.date}`);

  doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
  doc.text(`${invoice.type === 'sales' ? 'Bill To' : 'Vendor'}: ${partyName || '-'}`, 40, 120);
  doc.text(`Status: ${invoice.status.toUpperCase().replace('_', ' ')}`, 40, 138);
  doc.text(`Due Date: ${invoice.due_date || '-'}`, 40, 156);
  if (invoice.reference_no) doc.text(`Reference: ${invoice.reference_no}`, 300, 120);

  doc.y = 185;
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

  doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
  doc.text(`Subtotal: ${Number(invoice.subtotal).toFixed(3)}`, { align: 'right' });
  doc.text(`Tax: ${Number(invoice.tax_total).toFixed(3)}`, { align: 'right' });
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(`Total: ${Number(invoice.total).toFixed(3)} ${invoice.currency}`, { align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
  doc.text(`Paid: ${Number(invoice.paid_total).toFixed(3)}`, { align: 'right' });
  doc.font('Helvetica-Bold').fillColor(Number(invoice.total) - Number(invoice.paid_total) > 0.001 ? '#dc2626' : '#059669')
    .text(`Balance Due: ${(Number(invoice.total) - Number(invoice.paid_total)).toFixed(3)}`, { align: 'right' });

  if (invoice.notes) {
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Notes: ${invoice.notes}`);
  }

  footer(doc);
  doc.end();
}

function generateAgingPdf(res, aging, company) {
  const label = aging.type === 'sales' ? 'Accounts Receivable Aging' : 'Accounts Payable Aging';
  const doc = newDoc(res, `${aging.type}-aging-${aging.as_of}.pdf`);
  header(doc, company, label, `As of ${aging.as_of}`);

  doc.y = 120;
  table(doc, {
    headers: [
      { label: 'Invoice' }, { label: aging.type === 'sales' ? 'Client' : 'Supplier' }, { label: 'Due Date' },
      { label: 'Outstanding', align: 'right' }, { label: 'Days Overdue', align: 'right' }, { label: 'Bucket' },
    ],
    colWidths: [80, 150, 70, 90, 80, 60],
    rows: aging.rows.map((r) => [r.invoice_no, r.party || '-', r.due_date || '-', r.outstanding.toFixed(3), String(r.days_overdue), r.bucket]),
  });

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Summary by Age Bucket');
  Object.entries(aging.buckets).forEach(([bucket, amount]) => {
    doc.font('Helvetica').fontSize(9).fillColor('#1e293b').text(`${bucket}: ${amount.toFixed(3)}`);
  });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(`Total Outstanding: ${aging.total_outstanding.toFixed(3)}`, { align: 'right' });

  footer(doc);
  doc.end();
}

module.exports = { generateVoucherPdf, generateProfitAndLossPdf, generateBalanceSheetPdf, generateTrialBalancePdf, generateInvoicePdf, generateAgingPdf };
