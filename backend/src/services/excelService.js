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
      { header: 'Branch', key: 'branch', width: 20 },
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
        r.branch ? `${r.branch.code} - ${r.branch.name_en}` : '',
        Number(r.debit) || 0,
        Number(r.credit) || 0,
        Number(r.running_balance) || 0,
      ]);
    });
    sheet.getColumn(6).numFmt = '#,##0.000';
    sheet.getColumn(7).numFmt = '#,##0.000';
    sheet.getColumn(8).numFmt = '#,##0.000';
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
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((v) => {
      sheet.addRow([v.voucher_no, v.voucher_type, v.date, v.description || '', v.branch ? `${v.branch.code} - ${v.branch.name_en}` : '', Number(v.total_debit), v.status]);
    });
    sheet.getColumn(6).numFmt = '#,##0.000';
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
      { header: 'Branch', key: 'branch', width: 20 },
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
      sheet.addRow([inv.invoice_no, party || '', inv.date, inv.due_date || '', inv.branch ? `${inv.branch.code} - ${inv.branch.name_en}` : '', Number(inv.subtotal), Number(inv.tax_total), Number(inv.total), Number(inv.paid_total), inv.status]);
    });
    [6, 7, 8, 9].forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.000'; });
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

async function exportVehicles(res, company, rows) {
  await streamWorkbook(res, `vehicles.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Vehicles');
    addTitleBlock(sheet, `${company?.name_en || ''} — Vehicles`, `${rows.length} records`, 7);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Plate No.', key: 'plate_no', width: 14 },
      { header: 'Make', key: 'make', width: 16 },
      { header: 'Model', key: 'model', width: 16 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Driver', key: 'driver', width: 22 },
      { header: 'Status', key: 'status', width: 14 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((v) => {
      sheet.addRow([
        v.code, v.plate_no, v.make || '', v.model || '', v.vehicle_type || '',
        v.driver ? v.driver.name_en : '', v.status || '',
      ]);
    });
  });
}

async function exportItems(res, company, rows) {
  await streamWorkbook(res, `items.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Items');
    addTitleBlock(sheet, `${company?.name_en || ''} — Inventory Items`, `${rows.length} records`, 10);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Name (EN)', key: 'name_en', width: 26 },
      { header: 'Name (AR)', key: 'name_ar', width: 26 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Variants', key: 'variants', width: 10 },
      { header: 'Qty on Hand', key: 'qty', width: 14 },
      { header: 'Stock Value', key: 'value', width: 14 },
      { header: 'Selling Price', key: 'price', width: 14 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((it) => {
      const qty = Number(it.total_quantity_on_hand ?? it.quantity_on_hand) || 0;
      const cost = Number(it.cost_price) || 0;
      const value = it.total_value !== undefined ? Number(it.total_value) : qty * cost;
      sheet.addRow([it.code, it.sku || '', it.name_en, it.name_ar, it.category_name || it.category || '', it.unit, it.variant_count || 0, qty, value, Number(it.selling_price) || 0]);
    });
    [9, 10].forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.000'; });
    sheet.getColumn(8).numFmt = '#,##0.00';
  });
}

// rows are StockTransfer headers (with a .lines array, each line carrying its
// own .item/.variant) — one Excel row per transfer LINE, so a multi-item
// transfer still lists every item it moved.
async function exportStockTransfers(res, company, rows) {
  await streamWorkbook(res, `stock-transfers.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Stock Transfers');
    const lineCount = rows.reduce((s, r) => s + (r.lines?.length || 1), 0);
    addTitleBlock(sheet, `${company?.name_en || ''} — Stock Transfers`, `${rows.length} transfers, ${lineCount} lines`, 8);

    sheet.columns = [
      { header: 'Transfer No.', key: 'no', width: 16 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Item', key: 'item', width: 26 },
      { header: 'Variant', key: 'variant', width: 18 },
      { header: 'From', key: 'from', width: 22 },
      { header: 'To', key: 'to', width: 22 },
      { header: 'Quantity', key: 'qty', width: 14 },
      { header: 'Unit Cost', key: 'cost', width: 14 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    const locationLabel = (branch) => (branch ? `${branch.code} - ${branch.name_en}` : 'Unbranched');

    rows.forEach((r) => {
      (r.lines || []).forEach((l) => {
        sheet.addRow([
          r.transfer_no, r.date, l.item ? `${l.item.code} - ${l.item.name_en}` : '',
          l.variant ? l.variant.sku : '',
          locationLabel(r.fromBranch), locationLabel(r.toBranch),
          Number(l.quantity) || 0, Number(l.unit_cost) || 0,
        ]);
      });
    });
    sheet.getColumn(7).numFmt = '#,##0.000';
    sheet.getColumn(8).numFmt = '#,##0.000';
  });
}

async function exportItemVariants(res, company, item, rows) {
  await streamWorkbook(res, `item-variants-${item.code}.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Variants');
    addTitleBlock(sheet, `${company?.name_en || ''} — ${item.name_en} Variants`, `${rows.length} records`, 6);

    sheet.columns = [
      { header: 'SKU', key: 'sku', width: 18 },
      { header: 'Attributes', key: 'attributes', width: 30 },
      { header: 'Qty on Hand', key: 'qty', width: 14 },
      { header: 'Avg Cost', key: 'cost', width: 14 },
      { header: 'Value', key: 'value', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((v) => {
      const attrText = Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(', ');
      const qty = Number(v.total_quantity_on_hand ?? v.quantity_on_hand) || 0;
      const value = v.total_value !== undefined ? Number(v.total_value) : qty * Number(v.cost_price || 0);
      sheet.addRow([v.sku, attrText, qty, Number(v.cost_price) || 0, value, v.is_active ? 'Active' : 'Inactive']);
    });
    [4, 5].forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.000'; });
    sheet.getColumn(3).numFmt = '#,##0.00';
  });
}

// ---- Inventory Reports ----

async function exportStockValuation(res, company, rows, locationLabel) {
  await streamWorkbook(res, `stock-valuation.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Stock Valuation');
    addTitleBlock(sheet, `${company?.name_en || ''} — Stock Valuation`, locationLabel, 7);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Item', key: 'item', width: 26 },
      { header: 'Variant', key: 'variant', width: 20 },
      { header: 'Qty on Hand', key: 'qty', width: 14 },
      { header: 'Avg Cost', key: 'cost', width: 14 },
      { header: 'Value', key: 'value', width: 14 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    let totalValue = 0;
    rows.forEach((r) => {
      totalValue += r.value;
      sheet.addRow([
        r.code, r.sku || '', r.name_en,
        r.variant_id ? Object.entries(r.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(', ') : '',
        r.quantity_on_hand, r.cost_price, r.value,
      ]);
    });
    sheet.addRow([]);
    const totalRow = sheet.addRow(['', '', '', '', '', 'Total Value', totalValue]);
    totalRow.font = { bold: true };
    [5].forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.00'; });
    [6, 7].forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.000'; });
  });
}

async function exportLowStock(res, company, rows, locationLabel) {
  await streamWorkbook(res, `low-stock.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Low Stock');
    addTitleBlock(sheet, `${company?.name_en || ''} — Low Stock / Reorder Report`, locationLabel, 6);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Item', key: 'item', width: 26 },
      { header: 'Variant', key: 'variant', width: 20 },
      { header: 'Qty on Hand', key: 'qty', width: 14 },
      { header: 'Reorder Level', key: 'reorder', width: 14 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((r) => {
      sheet.addRow([
        r.code, r.sku || '', r.name_en,
        r.variant_id ? Object.entries(r.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(', ') : '',
        r.quantity_on_hand, r.reorder_level,
      ]);
    });
    [5, 6].forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.00'; });
  });
}

async function exportStockMovement(res, company, item, rows) {
  await streamWorkbook(res, `stock-movement-${item.code}.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Stock Movement');
    addTitleBlock(sheet, `${company?.name_en || ''} — ${item.name_en} Movement`, `${rows.length} records`, 8);

    sheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Reference', key: 'ref', width: 14 },
      { header: 'Quantity', key: 'qty', width: 14 },
      { header: 'Unit Cost', key: 'cost', width: 14 },
      { header: 'Balance Qty', key: 'balQty', width: 14 },
      { header: 'Balance Value', key: 'balValue', width: 16 },
      { header: 'Notes', key: 'notes', width: 26 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((r) => {
      sheet.addRow([
        r.date, r.type, r.reference_type || '',
        Number(r.quantity), Number(r.unit_cost),
        Number(r.balance_qty_after), Number(r.balance_value_after),
        r.notes || '',
      ]);
    });
    [4, 5, 6, 7].forEach((col) => { sheet.getColumn(col).numFmt = '#,##0.000'; });
  });
}

async function exportSoldByClient(res, company, rows, { from, to } = {}) {
  const period = from || to ? `${from || '...'} to ${to || '...'}` : 'All dates';
  await streamWorkbook(res, 'sold-items-per-client.xlsx', (wb) => {
    const sheet = wb.addWorksheet('Sold Items Per Client');
    addTitleBlock(sheet, `${company?.name_en || ''} — Sold Items Per Client`, period, 6);

    sheet.columns = [
      { header: 'Client', key: 'client', width: 26 },
      { header: 'Item', key: 'item', width: 26 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Qty Sold', key: 'qty', width: 12 },
      { header: 'Revenue', key: 'revenue', width: 14 },
      { header: 'Invoices', key: 'invoices', width: 10 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((r) => {
      sheet.addRow([r.client_name, r.item_name, r.sku || '', Number(r.quantity_sold), Number(r.revenue), r.invoice_count]);
    });
    sheet.getColumn(4).numFmt = '#,##0.00';
    sheet.getColumn(5).numFmt = '#,##0.000';
  });
}

async function exportPurchaseOrders(res, company, rows) {
  await streamWorkbook(res, `purchase-orders.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Purchase Orders');
    addTitleBlock(sheet, `${company?.name_en || ''} — Purchase Orders`, `${rows.length} records`, 7);

    sheet.columns = [
      { header: 'PO No.', key: 'no', width: 16 },
      { header: 'Supplier', key: 'supplier', width: 26 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Expected Date', key: 'expected', width: 14 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Bill No.', key: 'bill', width: 16 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((po) => {
      sheet.addRow([po.po_no, po.supplier?.name_en || '', po.date, po.expected_date || '', po.branch ? `${po.branch.code} - ${po.branch.name_en}` : '', Number(po.total), po.status, po.convertedInvoice?.invoice_no || '']);
    });
    sheet.getColumn(6).numFmt = '#,##0.000';
  });
}

async function exportBranches(res, company, rows) {
  await streamWorkbook(res, `branches.xlsx`, (wb) => {
    const sheet = wb.addWorksheet('Branches');
    addTitleBlock(sheet, `${company?.name_en || ''} — Branches`, `${rows.length} records`, 5);

    sheet.columns = [
      { header: 'Code', key: 'code', width: 14 },
      { header: 'Name (EN)', key: 'name_en', width: 26 },
      { header: 'Name (AR)', key: 'name_ar', width: 26 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Linked Accounts', key: 'accounts', width: 40 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    const headerRowIndex = sheet.lastRow.number + 1;
    sheet.addRow(sheet.columns.map((c) => c.header));
    styleHeaderRow(sheet.getRow(headerRowIndex));

    rows.forEach((b) => {
      const linkedAccounts = (b.accounts || []).map((a) => `${a.code} - ${a.name_en}`).join(', ');
      sheet.addRow([b.code, b.name_en, b.name_ar, b.phone || '', linkedAccounts, b.is_active ? 'Active' : 'Inactive']);
    });
  });
}

module.exports = {
  exportLedger, exportTrialBalance, exportVouchers, exportInvoices, exportEmployees,
  exportCostCenters, exportCashAccounts, exportSuppliers, exportClients,
  exportVehicles, exportItems, exportPurchaseOrders, exportBranches, exportStockTransfers,
  exportItemVariants, exportStockValuation, exportLowStock, exportStockMovement,
  exportSoldByClient,
};
