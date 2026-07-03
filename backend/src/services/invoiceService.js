const { sequelize, Invoice, InvoiceLine, InvoicePayment, Client, Supplier, Voucher, VoucherLine } = require('../models');
const voucherService = require('./voucherService');

const PREFIX = { sales: 'INV', purchase: 'BILL' };

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Invoice not found'); e.status = 404; return e; }

async function nextInvoiceNo(companyId, type) {
  const count = await Invoice.count({ where: { company_id: companyId, type } });
  return `${PREFIX[type]}-${String(count + 1).padStart(6, '0')}`;
}

function computeLine(l) {
  const quantity = Number(l.quantity ?? 1);
  const unit_price = Number(l.unit_price ?? 0);
  const tax_rate = Number(l.tax_rate ?? 0);
  const line_subtotal = quantity * unit_price;
  const line_tax = line_subtotal * (tax_rate / 100);
  return { ...l, quantity, unit_price, tax_rate, line_subtotal, line_tax, line_total: line_subtotal + line_tax };
}

// Creates a draft invoice with computed line totals. No ledger impact yet.
async function createInvoice(companyId, userId, payload) {
  const { type, client_id, supplier_id, date, due_date, cost_center_id, tax_account_id, currency, notes, reference_no, lines } = payload;

  if (!['sales', 'purchase'].includes(type)) throw badRequest('Invoice type must be "sales" or "purchase"');
  if (type === 'sales' && !client_id) throw badRequest('client_id is required for sales invoices');
  if (type === 'purchase' && !supplier_id) throw badRequest('supplier_id is required for purchase invoices');
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('At least one line item is required');

  const computedLines = lines.map(computeLine);
  const subtotal = computedLines.reduce((s, l) => s + l.line_subtotal, 0);
  const tax_total = computedLines.reduce((s, l) => s + l.line_tax, 0);
  const total = subtotal + tax_total;

  return sequelize.transaction(async (t) => {
    const invoice_no = await nextInvoiceNo(companyId, type);
    const invoice = await Invoice.create({
      company_id: companyId,
      type,
      client_id: client_id || null,
      supplier_id: supplier_id || null,
      invoice_no,
      reference_no: reference_no || null,
      date,
      due_date: due_date || null,
      cost_center_id: cost_center_id || null,
      tax_account_id: tax_account_id || null,
      currency: currency || 'KWD',
      notes,
      subtotal,
      tax_total,
      total,
      status: 'draft',
      created_by: userId,
    }, { transaction: t });

    await Promise.all(computedLines.map((l, idx) => InvoiceLine.create({
      invoice_id: invoice.id,
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

    return invoice;
  });
}

// Posts a draft invoice: synthesizes a journal voucher (Debit/Credit the
// client or supplier control account against revenue/expense + tax lines)
// and posts it through the existing voucher/ledger pipeline, so invoices
// share the exact same audited posting logic as every other transaction.
async function postInvoice(companyId, invoiceId, userId) {
  const invoice = await Invoice.findOne({
    where: { id: invoiceId, company_id: companyId },
    include: [
      { model: InvoiceLine, as: 'lines' },
      { model: Client, as: 'client' },
      { model: Supplier, as: 'supplier' },
    ],
  });
  if (!invoice) throw notFound();
  if (invoice.status !== 'draft') throw badRequest('Only draft invoices can be posted');

  const controlAccountId = invoice.type === 'sales' ? invoice.client?.account_id : invoice.supplier?.account_id;
  if (!controlAccountId) {
    throw badRequest(`The ${invoice.type === 'sales' ? 'client' : 'supplier'} must have a linked GL account before this invoice can be posted`);
  }

  const useSeparateTax = !!invoice.tax_account_id && Number(invoice.tax_total) > 0.001;
  const lines = [];

  lines.push({
    account_id: controlAccountId,
    debit: invoice.type === 'sales' ? Number(invoice.total) : 0,
    credit: invoice.type === 'purchase' ? Number(invoice.total) : 0,
    description: `${invoice.type === 'sales' ? 'Invoice' : 'Bill'} ${invoice.invoice_no}`,
    client_id: invoice.client_id,
    supplier_id: invoice.supplier_id,
  });

  invoice.lines.forEach((l) => {
    const amount = useSeparateTax ? Number(l.line_subtotal) : Number(l.line_total);
    lines.push({
      account_id: l.account_id,
      debit: invoice.type === 'purchase' ? amount : 0,
      credit: invoice.type === 'sales' ? amount : 0,
      description: l.description || invoice.invoice_no,
    });
  });

  if (useSeparateTax) {
    lines.push({
      account_id: invoice.tax_account_id,
      debit: invoice.type === 'purchase' ? Number(invoice.tax_total) : 0,
      credit: invoice.type === 'sales' ? Number(invoice.tax_total) : 0,
      description: `Tax on ${invoice.invoice_no}`,
    });
  }

  const voucher = await voucherService.createVoucher(companyId, userId, {
    voucher_type: 'journal',
    date: invoice.date,
    description: `${invoice.type === 'sales' ? 'Sales Invoice' : 'Purchase Bill'} ${invoice.invoice_no}`,
    cost_center_id: invoice.cost_center_id,
    currency: invoice.currency,
    lines,
  });
  await voucherService.postVoucher(companyId, voucher.id);

  await invoice.update({ status: 'posted', posted_at: new Date(), posting_voucher_id: voucher.id });
  return invoice;
}

// Records a payment against a posted invoice by creating + posting a
// receipt (sales) or payment (purchase) voucher that moves cash against the
// client/supplier control account, then updates the invoice's paid status.
async function recordPayment(companyId, invoiceId, userId, { amount, date, cash_account_id, notes }) {
  const invoice = await Invoice.findOne({
    where: { id: invoiceId, company_id: companyId },
    include: [{ model: Client, as: 'client' }, { model: Supplier, as: 'supplier' }],
  });
  if (!invoice) throw notFound();
  if (!['posted', 'partially_paid'].includes(invoice.status)) throw badRequest('Only posted (unpaid or partially paid) invoices can receive a payment');
  if (!cash_account_id) throw badRequest('cash_account_id is required');

  const remaining = Number(invoice.total) - Number(invoice.paid_total);
  const payAmount = Number(amount);
  if (payAmount <= 0) throw badRequest('Payment amount must be greater than zero');
  if (payAmount > remaining + 0.001) throw badRequest(`Payment of ${payAmount} exceeds the remaining balance of ${remaining.toFixed(3)}`);

  const controlAccountId = invoice.type === 'sales' ? invoice.client?.account_id : invoice.supplier?.account_id;
  if (!controlAccountId) throw badRequest('The client/supplier must have a linked GL account');

  const voucherLines = invoice.type === 'sales'
    ? [
        { account_id: cash_account_id, debit: payAmount, credit: 0, description: `Payment for ${invoice.invoice_no}`, client_id: invoice.client_id },
        { account_id: controlAccountId, debit: 0, credit: payAmount, description: `Payment for ${invoice.invoice_no}`, client_id: invoice.client_id },
      ]
    : [
        { account_id: controlAccountId, debit: payAmount, credit: 0, description: `Payment for ${invoice.invoice_no}`, supplier_id: invoice.supplier_id },
        { account_id: cash_account_id, debit: 0, credit: payAmount, description: `Payment for ${invoice.invoice_no}`, supplier_id: invoice.supplier_id },
      ];

  const voucher = await voucherService.createVoucher(companyId, userId, {
    voucher_type: invoice.type === 'sales' ? 'receipt' : 'payment',
    date: date || new Date().toISOString().slice(0, 10),
    description: `${invoice.type === 'sales' ? 'Receipt' : 'Payment'} for ${invoice.invoice_no}`,
    lines: voucherLines,
  });
  await voucherService.postVoucher(companyId, voucher.id);

  await InvoicePayment.create({
    invoice_id: invoice.id,
    voucher_id: voucher.id,
    amount: payAmount,
    date: date || new Date().toISOString().slice(0, 10),
    notes,
  });

  const newPaidTotal = Number(invoice.paid_total) + payAmount;
  const newStatus = newPaidTotal >= Number(invoice.total) - 0.001 ? 'paid' : 'partially_paid';
  await invoice.update({ paid_total: newPaidTotal, status: newStatus });

  return invoice;
}

// Cancels a posted invoice. Blocked once any payment has been recorded —
// reverse/delete the payment vouchers first to keep the audit trail sane.
async function cancelInvoice(companyId, invoiceId) {
  const invoice = await Invoice.findOne({ where: { id: invoiceId, company_id: companyId } });
  if (!invoice) throw notFound();
  if (invoice.status !== 'posted') throw badRequest('Only a posted invoice with no payments can be cancelled');

  if (invoice.posting_voucher_id) {
    await voucherService.cancelVoucher(companyId, invoice.posting_voucher_id);
  }
  await invoice.update({ status: 'cancelled' });
  return invoice;
}

module.exports = { createInvoice, postInvoice, recordPayment, cancelInvoice, nextInvoiceNo, computeLine };
