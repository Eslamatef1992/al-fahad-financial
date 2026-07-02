const ExcelJS = require('exceljs');

const NAVY_ARGB = 'FF1F2D4E';
const GOLD_ARGB = 'FFC9A227';

async function streamWorkbook(res, filename, buildFn) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Al Fahad Group Financial System';
  workbook.created = new Date();
  buildFn(workbook);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_ARGB } };
    cell.alignment = { vertical: 'middle' };
  });
  row.height = 20;
}

function addTitleBlock(sheet, title, subtitle, colSpan) {
  sheet.mergeCells(1, 1, 1, colSpan);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: NAVY_ARGB } };

  if (subtitle) {
    sheet.mergeCells(2, 1, 2, colSpan);
    const subCell = sheet.getCell(2, 1);
    subCell.value = subtitle;
    subCell.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
  }
  sheet.addRow([]);
}

async function exportLedger(res, company, rows, filters) {
  await streamWorkbook(res, `general-ledger.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('General Ledger');
    addTitleBlock(sheet, `${company?.name_en || ''} — General Ledger`, `${filters.from || 'inception'} to ${filters.to || 'present'}`, 7);

    sheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Account', key: 'account', width: 32 },
      { header: 'Voucher No.', key: 'voucher', width: 16 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Debit', key: 'debit', width: 14 },
      { header: 'Credit', key: 'credit', width: 14 },
      { header: 'Balance', key: 'balance', width: 14 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((r) => {
      sheet.addRow([
        r.date,
        r.account ? `${r.account.code} - ${r.account.name_en}` : '',
        r.Voucher?.voucher_no || '',
        r.description || '',
        Number(r.debit) || 0,
        Number(r.credit) || 0,
        Number(r.running_balance) || 0,
      ]);
    });
    sheet.getColumn(5).numFmt = '#,##0.000';
    sheet.getColumn(6).numFmt = '#,##0.000';
    sheet.getColumn(7).numFmt = '#,##0.000';
  });
}

async function exportTrialBalance(res, company, rows, asOf) {
  await streamWorkbook(res, `trial-balance.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Trial Balance');
    addTitleBlock(sheet, `${company?.name_en || ''} — Trial Balance`, asOf ? `As of ${asOf}` : 'All dates', 4);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Account', key: 'account', width: 36 },
      { header: 'Debit', key: 'debit', width: 16 },
      { header: 'Credit', key: 'credit', width: 16 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((r) => {
      sheet.addRow([r.account?.code, r.account?.name_en, r.debit, r.credit]);
    });
    sheet.getColumn(3).numFmt = '#,##0.000';
    sheet.getColumn(4).numFmt = '#,##0.000';
  });
}

async function exportVouchers(res, company, rows) {
  await streamWorkbook(res, `vouchers.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Vouchers');
    addTitleBlock(sheet, `${company?.name_en || ''} — Vouchers`, `${rows.length} records`, 6);

    sheet.columns = [
      { header: 'Voucher No.', key: 'no', width: 16 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Description', key: 'description', width: 34 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((v) => {
      sheet.addRow([v.voucher_no, v.voucher_type, v.date, v.description || '', Number(v.total_debit), v.status]);
    });
    sheet.getColumn(5).numFmt = '#,##0.000';
  });
}

module.exports = { exportLedger, exportTrialBalance, exportVouchers };
