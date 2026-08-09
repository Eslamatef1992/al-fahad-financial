const { sequelize, PurchaseOrder, PurchaseOrderLine, Supplier, Account, Item, Invoice, InvoiceLine } = require('../models');
const invoiceService = require('./invoiceService');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Purchase order not found'); e.status = 404; return e; }

async function nextPoNo(companyId) {
  const count = await PurchaseOrder.count({ where: { company_id: companyId } });
  return `PO-${String(count + 1).padStart(6, '0')}`;
}

function computeLine(l) {
  const quantity = Number(l.quantity ?? 1);
  const unit_price = Number(l.unit_price ?? 0);
  const tax_rate = Number(l.tax_rate ?? 0);
  const line_subtotal = quantity * unit_price;
  const line_tax = line_subtotal * (tax_rate / 100);
  return { ...l, quantity, unit_price, tax_rate, line_subtotal, line_tax, line_total: line_subtotal + line_tax };
}

// A line either links to an inventory Item (account_id defaults to that
// item's inventory asset account, but can still be overridden) or posts
// directly to any Chart-of-Accounts account chosen freehand — e.g. a one-off
// expense with no stock impact. Every line always ends up with a concrete
// account_id so conversion to a bill never has an ambiguous destination.
async function resolveLineAccount(companyId, line, t) {
  if (line.account_id) return line.account_id;
  if (line.item_id) {
    const item = await Item.findOne({ where: { id: line.item_id, company_id: companyId }, transaction: t });
    if (!item) throw badRequest('Invalid item on purchase order line');
    return item.inventory_account_id;
  }
  throw badRequest('Each purchase order line needs either an item_id or an account_id');
}

async function validateLines(companyId, lines, t) {
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('At least one line item is required');
  return Promise.all(lines.map(async (l) => {
    const account_id = await resolveLineAccount(companyId, l, t);
    return computeLine({ ...l, account_id });
  }));
}

async function createPurchaseOrder(companyId, userId, payload) {
  const { supplier_id, date, expected_date, cost_center_id, branch_id, currency, notes, lines } = payload;
  if (!supplier_id) throw badRequest('supplier_id is required');

  return sequelize.transaction(async (t) => {
    const supplier = await Supplier.findOne({ where: { id: supplier_id, company_id: companyId }, transaction: t });
    if (!supplier) throw badRequest('Supplier not found');

    const computedLines = await validateLines(companyId, lines, t);
    const subtotal = computedLines.reduce((s, l) => s + l.line_subtotal, 0);
    const tax_total = computedLines.reduce((s, l) => s + l.line_tax, 0);
    const total = subtotal + tax_total;

    const po_no = await nextPoNo(companyId);
    const po = await PurchaseOrder.create({
      company_id: companyId,
      supplier_id,
      po_no,
      date,
      expected_date: expected_date || null,
      cost_center_id: cost_center_id || null,
      branch_id: branch_id || null,
      currency: currency || 'KWD',
      notes,
      subtotal,
      tax_total,
      total,
      status: 'draft',
      created_by: userId,
    }, { transaction: t });

    await Promise.all(computedLines.map((l, idx) => PurchaseOrderLine.create({
      purchase_order_id: po.id,
      item_id: l.item_id || null,
      variant_id: l.variant_id || null,
      account_id: l.account_id,
      description: l.description || '',
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
      line_subtotal: l.line_subtotal,
      line_tax: l.line_tax,
      line_total: l.line_total,
      line_order: idx,
    }, { transaction: t })));

    return po;
  });
}

async function updatePurchaseOrder(companyId, poId, payload) {
  const { supplier_id, date, expected_date, cost_center_id, branch_id, currency, notes, lines } = payload;

  return sequelize.transaction(async (t) => {
    const po = await PurchaseOrder.findOne({
      where: { id: poId, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE,
    });
    if (!po) throw notFound();
    if (po.status !== 'draft') throw badRequest('Only draft purchase orders can be edited');

    if (supplier_id) {
      const supplier = await Supplier.findOne({ where: { id: supplier_id, company_id: companyId }, transaction: t });
      if (!supplier) throw badRequest('Supplier not found');
    }

    const computedLines = await validateLines(companyId, lines, t);
    const subtotal = computedLines.reduce((s, l) => s + l.line_subtotal, 0);
    const tax_total = computedLines.reduce((s, l) => s + l.line_tax, 0);
    const total = subtotal + tax_total;

    await po.update({
      supplier_id: supplier_id || po.supplier_id,
      date,
      expected_date: expected_date || null,
      cost_center_id: cost_center_id || null,
      branch_id: branch_id || null,
      currency: currency || po.currency,
      notes,
      subtotal,
      tax_total,
      total,
    }, { transaction: t });

    await PurchaseOrderLine.destroy({ where: { purchase_order_id: po.id }, transaction: t });
    await Promise.all(computedLines.map((l, idx) => PurchaseOrderLine.create({
      purchase_order_id: po.id,
      item_id: l.item_id || null,
      variant_id: l.variant_id || null,
      account_id: l.account_id,
      description: l.description || '',
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
      line_subtotal: l.line_subtotal,
      line_tax: l.line_tax,
      line_total: l.line_total,
      line_order: idx,
    }, { transaction: t })));

    return po;
  });
}

// Converts a draft PO into a real Purchase Bill (Invoice type='purchase') —
// the PO itself never posts to the ledger; the resulting bill does, using the
// existing invoice posting pipeline (which also drives stock receipt for any
// item-linked lines once the bill is posted). The PO is marked 'converted'
// and linked to the new bill so it can no longer be edited or converted again.
async function convertToPurchaseBill(companyId, poId, userId) {
  return sequelize.transaction(async (t) => {
    // Lock the PO header row alone first — FOR UPDATE cannot be combined with
    // the hasMany lines join (same constraint worked around elsewhere, e.g.
    // voucherService.postVoucher / invoiceService.postInvoice).
    const po = await PurchaseOrder.findOne({
      where: { id: poId, company_id: companyId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!po) throw notFound();
    if (po.status !== 'draft') throw badRequest('Only a draft purchase order can be converted to a bill');

    po.lines = await PurchaseOrderLine.findAll({ where: { purchase_order_id: po.id }, transaction: t });

    const invoice_no = await invoiceService.nextInvoiceNo(companyId, 'purchase');
    const invoice = await Invoice.create({
      company_id: companyId,
      type: 'purchase',
      supplier_id: po.supplier_id,
      invoice_no,
      reference_no: po.po_no,
      date: new Date().toISOString().slice(0, 10),
      due_date: null,
      cost_center_id: po.cost_center_id,
      branch_id: po.branch_id,
      currency: po.currency,
      notes: po.notes,
      subtotal: po.subtotal,
      tax_total: po.tax_total,
      total: po.total,
      status: 'draft',
      created_by: userId,
    }, { transaction: t });

    await Promise.all(po.lines.map((l, idx) => InvoiceLine.create({
      invoice_id: invoice.id,
      account_id: l.account_id,
      item_id: l.item_id || null,
      variant_id: l.variant_id || null,
      description: l.description || `From ${po.po_no}`,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
      line_subtotal: l.line_subtotal,
      line_tax: l.line_tax,
      line_total: l.line_total,
      line_order: idx,
    }, { transaction: t })));

    await po.update({ status: 'converted', converted_invoice_id: invoice.id }, { transaction: t });

    return { po, invoice };
  });
}

async function cancelPurchaseOrder(companyId, poId) {
  const po = await PurchaseOrder.findOne({ where: { id: poId, company_id: companyId } });
  if (!po) throw notFound();
  if (po.status !== 'draft') throw badRequest('Only a draft purchase order can be cancelled');
  await po.update({ status: 'cancelled' });
  return po;
}

async function removePurchaseOrder(companyId, poId) {
  const po = await PurchaseOrder.findOne({ where: { id: poId, company_id: companyId } });
  if (!po) throw notFound();
  if (po.status !== 'draft') throw badRequest('Only a draft purchase order can be deleted');
  await po.destroy();
}

module.exports = {
  nextPoNo, createPurchaseOrder, updatePurchaseOrder, convertToPurchaseBill, cancelPurchaseOrder, removePurchaseOrder, computeLine,
};
