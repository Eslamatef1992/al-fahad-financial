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

async function exportInvoices(res, company, rows, invoiceType) {
  const label = invoiceType === 'sales' ? 'Sales Invoices' : 'Purchase Bills';
  await streamWorkbook(res, `${invoiceType}-invoices.xlsx`, (wb) => {
    const sheet = wb.addWorksheet(label);
    addTitleBlock(sheet, `${company?.name_en || ''} — ${label}`, `${rows.length} records`, 8);

    sheet.columns = [
      { header: 'Invoice No.', key: 'no', width: 16 },
      { header: invoiceType === 'sales' ? 'Client' : 'Supplier', key: 'party', width: 28 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Due Date', key: 'due', width: 12 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
      { header: 'Tax', key: 'tax', width: 12 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Paid', key: 'paid', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((inv) => {
      const party = invoiceType === 'sales' ? inv.client?.name_en : inv.supplier?.name_en;
      sheet.addRow([inv.invoice_no, party || '', inv.date, inv.due_date || '', Number(inv.subtotal), Number(inv.tax_total), Number(inv.total), Number(inv.paid_total), inv.status]);
    });
    [5, 6, 7, 8].forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.000'; });
  });
}

async function exportEmployees(res, company, rows) {
  await streamWorkbook(res, `employees.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Employees');
    addTitleBlock(sheet, `${company?.name_en || ''} — Employees`, `${rows.length} records`, 9);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Position', key: 'position', width: 18 },
      { header: 'Department', key: 'department', width: 18 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Salary', key: 'salary', width: 14 },
      { header: 'Vacation (days)', key: 'vacation', width: 16 },
      { header: 'Sick Leave (days)', key: 'sick', width: 16 },
      { header: 'Deduction', key: 'deduction', width: 14 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((e) => {
      sheet.addRow([
        e.code,
        e.name_en,
        e.position || '',
        e.department || '',
        e.phone || '',
        Number(e.salary) || 0,
        Number(e.vacation_balance) || 0,
        Number(e.sick_leave_balance) || 0,
        Number(e.deduction) || 0,
      ]);
    });
    sheet.getColumn(6).numFmt = '#,##0.000';
    sheet.getColumn(7).numFmt = '#,##0.00';
    sheet.getColumn(8).numFmt = '#,##0.00';
    sheet.getColumn(9).numFmt = '#,##0.000';
  });
}

async function exportCostCenters(res, company, rows) {
  await streamWorkbook(res, `cost-centers.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Cost Centers');
    addTitleBlock(sheet, `${company?.name_en || ''} — Cost Centers`, `${rows.length} records`, 5);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Name (EN)', key: 'name_en', width: 26 },
      { header: 'Name (AR)', key: 'name_ar', width: 26 },
      { header: 'Linked Account', key: 'account', width: 30 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((c) => {
      sheet.addRow([
        c.code, c.name_en, c.name_ar,
        c.account ? `${c.account.code} - ${c.account.name_en}` : '',
        c.is_active ? 'Active' : 'Inactive',
      ]);
    });
  });
}

async function exportCashAccounts(res, company, rows) {
  await streamWorkbook(res, `cash-control.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Cash Control');
    addTitleBlock(sheet, `${company?.name_en || ''} — Cash Control`, `${rows.length} records`, 6);

    sheet.columns = [
      { header: 'Name (EN)', key: 'name_en', width: 24 },
      { header: 'Name (AR)', key: 'name_ar', width: 24 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Linked Account', key: 'account', width: 30 },
      { header: 'Bank', key: 'bank', width: 20 },
      { header: 'Currency', key: 'currency', width: 12 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((c) => {
      sheet.addRow([
        c.name_en, c.name_ar, c.type.replace('_', ' '),
        c.account ? `${c.account.code} - ${c.account.name_en}` : '',
        c.bank_name || '', c.currency,
      ]);
    });
  });
}

async function exportSuppliers(res, company, rows) {
  await streamWorkbook(res, `suppliers.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Suppliers');
    addTitleBlock(sheet, `${company?.name_en || ''} — Suppliers`, `${rows.length} records`, 8);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Name (EN)', key: 'name_en', width: 26 },
      { header: 'Name (AR)', key: 'name_ar', width: 26 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 22 },
      { header: 'Linked Account', key: 'account', width: 30 },
      { header: 'Payment Terms (days)', key: 'terms', width: 18 },
      { header: 'Balance', key: 'balance', width: 16 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((s) => {
      sheet.addRow([
        s.code, s.name_en, s.name_ar, s.phone || '', s.email || '',
        s.account ? `${s.account.code} - ${s.account.name_en}` : '',
        s.payment_terms_days, Number(s.opening_balance) || 0,
      ]);
    });
    sheet.getColumn(8).numFmt = '#,##0.000';
  });
}

async function exportClients(res, company, rows) {
  await streamWorkbook(res, `clients.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Clients');
    addTitleBlock(sheet, `${company?.name_en || ''} — Clients`, `${rows.length} records`, 8);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Name (EN)', key: 'name_en', width: 26 },
      { header: 'Name (AR)', key: 'name_ar', width: 26 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 22 },
      { header: 'Linked Account', key: 'account', width: 30 },
      { header: 'Credit Limit', key: 'credit_limit', width: 16 },
      { header: 'Balance', key: 'balance', width: 16 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((c) => {
      sheet.addRow([
        c.code, c.name_en, c.name_ar, c.phone || '', c.email || '',
        c.account ? `${c.account.code} - ${c.account.name_en}` : '',
        Number(c.credit_limit) || 0, Number(c.opening_balance) || 0,
      ]);
    });
    sheet.getColumn(7).numFmt = '#,##0.000';
    sheet.getColumn(8).numFmt = '#,##0.000';
  });
}

module.exports = {
  exportLedger, exportTrialBalance, exportVouchers, exportInvoices, exportEmployees,
  exportCostCenters, exportCashAccounts, exportSuppliers, exportClients,
};
