const { sequelize, Invoice, InvoiceLine, InvoicePayment, Client, Supplier, Voucher, VoucherLine, Item, ItemBooking, InventoryTransaction } = require('../models');
const voucherService = require('./voucherService');
const itemService = require('./itemService');
const discountService = require('./discountService');

const PREFIX = { sales: 'INV', purchase: 'BILL' };

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Invoice not found'); e.status = 404; return e; }

async function nextInvoiceNo(companyId, type) {
  const count = await Invoice.count({ where: { company_id: companyId, type } });
  return `${PREFIX[type]}-${String(count + 1).padStart(6, '0')}`;
}

// `discount_amount`, if present on the line, is a pre-resolved dollar figure
// (from discountService.resolveDiscounts) that's netted out of the raw
// quantity*unit_price BEFORE tax — so line_subtotal/line_total are always
// the post-discount amounts, and every other consumer (ledger posting,
// COGS, reports, PDFs) just keeps working unmodified against them.
function computeLine(l) {
  const quantity = Number(l.quantity ?? 1);
  const unit_price = Number(l.unit_price ?? 0);
  const tax_rate = Number(l.tax_rate ?? 0);
  const discount_amount = Number(l.discount_amount ?? 0);
  const raw_subtotal = quantity * unit_price;
  const line_subtotal = Math.max(0, raw_subtotal - discount_amount);
  const line_tax = line_subtotal * (tax_rate / 100);
  return { ...l, quantity, unit_price, tax_rate, discount_amount, line_subtotal, line_tax, line_total: line_subtotal + line_tax };
}

// Resolves any header-level or per-line discount_code against the raw lines,
// then returns computed lines + totals, ready to persist. Shared by
// createInvoice and the draft-edit path in invoiceController.update so both
// apply discounts identically.
async function buildInvoiceLines(companyId, { lines, discount_code, excludeInvoiceId }, t) {
  const { perLineDiscount, perLineCodeId, discountCodeId, totalDiscount } = await discountService.resolveDiscounts(
    companyId, { lines, discount_code, excludeInvoiceId }, t,
  );
  const computedLines = lines.map((l, i) => computeLine({ ...l, discount_amount: perLineDiscount[i], discount_code_id: perLineCodeId[i] }));
  const subtotal = computedLines.reduce((s, l) => s + l.line_subtotal, 0);
  const tax_total = computedLines.reduce((s, l) => s + l.line_tax, 0);
  const total = subtotal + tax_total;
  return { computedLines, subtotal, tax_total, total, discountCodeId, totalDiscount };
}

// Creates a draft invoice with computed line totals. No ledger impact yet.
async function createInvoice(companyId, userId, payload) {
  const { type, client_id, supplier_id, date, due_date, cost_center_id, branch_id, tax_account_id, currency, notes, reference_no, lines, discount_code, channel, pos_shift_id, delivery_date, delivery_address, is_manufacture_order, manufacturer_id } = payload;

  if (!['sales', 'purchase'].includes(type)) throw badRequest('Invoice type must be "sales" or "purchase"');
  if (type === 'sales' && !client_id) throw badRequest('client_id is required for sales invoices');
  if (type === 'purchase' && !supplier_id) throw badRequest('supplier_id is required for purchase invoices');
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('At least one line item is required');
  for (const l of lines) {
    if (l.is_booked && !l.item_id) throw badRequest('Only a line linked to an inventory item can be booked for later delivery');
    if (l.is_booked && !l.delivery_date) throw badRequest('A booked line requires a delivery date');
  }

  return sequelize.transaction(async (t) => {
    const { computedLines, subtotal, tax_total, total, discountCodeId, totalDiscount } = await buildInvoiceLines(
      companyId, { lines, discount_code }, t,
    );

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
      branch_id: branch_id || null,
      tax_account_id: tax_account_id || null,
      currency: currency || 'KWD',
      notes,
      discount_code_id: discountCodeId,
      discount_amount: totalDiscount,
      subtotal,
      tax_total,
      total,
      status: 'draft',
      created_by: userId,
      channel: channel === 'pos' ? 'pos' : 'backoffice',
      pos_shift_id: channel === 'pos' ? (pos_shift_id || null) : null,
      delivery_date: delivery_date || null,
      delivery_address: delivery_address || null,
      is_manufacture_order: !!is_manufacture_order,
      manufacturer_id: is_manufacture_order ? (manufacturer_id || null) : null,
    }, { transaction: t });

    await Promise.all(computedLines.map((l, idx) => InvoiceLine.create({
      invoice_id: invoice.id,
      account_id: l.account_id,
      item_id: l.item_id || null,
      variant_id: l.variant_id || null,
      description: l.description || '',
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
      discount_code_id: l.discount_code_id || null,
      discount_amount: l.discount_amount || 0,
      line_subtotal: l.line_subtotal,
      line_tax: l.line_tax,
      line_total: l.line_total,
      line_order: idx,
      is_booked: !!l.is_booked,
      delivery_date: l.is_booked ? l.delivery_date : null,
    }, { transaction: t })));

    return invoice;
  });
}

// Posts a draft invoice: synthesizes a journal voucher (Debit/Credit the
// client or supplier control account against revenue/expense + tax lines)
// and posts it through the existing voucher/ledger pipeline, so invoices
// share the exact same audited posting logic as every other transaction.
//
// For any line linked to an inventory Item, this ALSO drives the inventory
// module in the same atomic transaction as the ledger posting:
//   - purchase bill lines RECEIVE stock and roll the item's weighted-average
//     cost forward using the line's unit price as the received unit cost.
//   - sales invoice lines ISSUE stock at the item's current weighted-average
//     cost and add an extra Debit COGS / Credit Inventory pair onto the SAME
//     journal voucher as the revenue recognition, so a sale is fully,
//     automatically self-balancing: AR/Revenue/Tax AND COGS/Inventory post
//     together as one posting, or neither does if anything fails.
async function postInvoice(companyId, invoiceId, userId) {
  return sequelize.transaction(async (t) => {
    // Lock the invoice header row alone first — FOR UPDATE cannot be combined
    // with the outer joins below (client/supplier are mutually nullable), the
    // same constraint voucherService.postVoucher already works around.
    const invoice = await Invoice.findOne({
      where: { id: invoiceId, company_id: companyId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!invoice) throw notFound();
    if (invoice.status !== 'draft') throw badRequest('Only draft invoices can be posted');

    invoice.lines = await InvoiceLine.findAll({ where: { invoice_id: invoice.id }, include: [{ model: Item, as: 'item' }], transaction: t });
    invoice.client = invoice.client_id ? await Client.findByPk(invoice.client_id, { transaction: t }) : null;
    invoice.supplier = invoice.supplier_id ? await Supplier.findByPk(invoice.supplier_id, { transaction: t }) : null;

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

    // Inventory side-effects, inside the same transaction as the voucher below.
    if (invoice.type === 'sales') {
      for (const l of invoice.lines) {
        if (!l.item_id) continue;

        // Booked lines stay in on-hand inventory — no stock is issued (and no
        // COGS posted) until the reservation is fulfilled later. This is the
        // one point where a "booked for future delivery" sale diverges from
        // an ordinary one: the invoice still posts revenue/AR normally, but
        // inventory doesn't move until delivery actually happens.
        if (l.is_booked) {
          await ItemBooking.create({
            company_id: companyId,
            item_id: l.item_id,
            variant_id: l.variant_id || null,
            branch_id: invoice.branch_id || null,
            invoice_id: invoice.id,
            invoice_line_id: l.id,
            client_id: invoice.client_id || null,
            quantity: Number(l.quantity),
            delivery_date: l.delivery_date || null,
            status: 'pending',
            created_by: userId,
          }, { transaction: t });
          continue;
        }

        const { item, cogsAmount } = await itemService.issueStock(companyId, l.item_id, {
          quantity: Number(l.quantity),
          date: invoice.date,
          referenceType: 'invoice',
          referenceId: invoice.id,
          userId,
          notes: `Sold on ${invoice.invoice_no}`,
          branchId: invoice.branch_id,
          variantId: l.variant_id,
        }, t);
        if (cogsAmount > 0.0009) {
          lines.push({
            account_id: item.cogs_account_id,
            debit: cogsAmount,
            credit: 0,
            description: `COGS - ${item.name_en} (${invoice.invoice_no})`,
          });
          lines.push({
            account_id: item.inventory_account_id,
            debit: 0,
            credit: cogsAmount,
            description: `COGS - ${item.name_en} (${invoice.invoice_no})`,
          });
        }
      }
    } else if (invoice.type === 'purchase') {
      for (const l of invoice.lines) {
        if (!l.item_id) continue;
        await itemService.receiveStock(companyId, l.item_id, {
          quantity: Number(l.quantity),
          unitCost: Number(l.unit_price),
          date: invoice.date,
          referenceType: 'invoice',
          referenceId: invoice.id,
          userId,
          notes: `Received on ${invoice.invoice_no}`,
          branchId: invoice.branch_id,
          variantId: l.variant_id,
        }, t);
      }
    }

    const voucher = await voucherService.createVoucher(companyId, userId, {
      voucher_type: 'journal',
      date: invoice.date,
      description: `${invoice.type === 'sales' ? 'Sales Invoice' : 'Purchase Bill'} ${invoice.invoice_no}`,
      cost_center_id: invoice.cost_center_id,
      branch_id: invoice.branch_id,
      currency: invoice.currency,
      lines,
    }, t);
    await voucherService.postVoucher(companyId, voucher.id, t);

    await invoice.update({ status: 'posted', posted_at: new Date(), posting_voucher_id: voucher.id }, { transaction: t });
    return invoice;
  });
}

// Records a payment against a posted invoice by creating + posting a
// receipt (sales) or payment (purchase) voucher that moves cash against the
// client/supplier control account, then updates the invoice's paid status.
async function recordPayment(companyId, invoiceId, userId, { amount, date, cash_account_id, notes, payment_method, reference }) {
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
    payment_method: payment_method || 'cash',
    reference: reference || null,
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
  // Release any still-pending reservations this invoice created — they never
  // touched stock, so there's nothing to reverse, just mark them cancelled
  // so they stop showing up as booked.
  await ItemBooking.update(
    { status: 'cancelled' },
    { where: { invoice_id: invoice.id, status: 'pending' } },
  );
  await invoice.update({ status: 'cancelled' });
  return invoice;
}

// Refunds a paid (or partially paid) sales invoice: reverses every payment
// voucher, reverses the main posting voucher (which undoes AR/Revenue/Tax
// AND the COGS/Inventory pair in one shot, since postInvoice put them on the
// same voucher), and restores physical stock line by line — all inside one
// atomic transaction so a failure partway through leaves nothing reversed.
//
// Booked lines are handled by their reservation state: a still-pending
// booking never issued stock, so it's simply released like a plain cancel.
// A booking that was already FULFILLED issued stock through its own
// separate delivery voucher (see bookingService.fulfillBooking) that this
// function has no reliable way to trace back to and reverse safely, so a
// refund is blocked outright when any of the invoice's bookings already
// shipped — that delivery needs to be reversed manually first.
//
// Stock is restored at the EXACT unit cost it was issued at (read back from
// the InventoryTransaction row postInvoice created), not the item's current
// average cost, so the refund is a true undo of the original sale rather
// than a fresh receipt that would skew the weighted-average cost basis.
//
// Deliberately full-invoice only (no partial-quantity refunds) — a bounded,
// safe MVP; partial refunds would need proportional tax/COGS splitting.
async function refundInvoice(companyId, userId, invoiceId, { reason } = {}) {
  return sequelize.transaction(async (t) => {
    const invoice = await Invoice.findOne({
      where: { id: invoiceId, company_id: companyId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!invoice) throw notFound();
    if (invoice.type !== 'sales') throw badRequest('Only sales invoices can be refunded');
    if (!['paid', 'partially_paid'].includes(invoice.status)) {
      throw badRequest('Only a paid or partially paid invoice can be refunded');
    }

    const lines = await InvoiceLine.findAll({ where: { invoice_id: invoice.id }, transaction: t });
    const bookings = await ItemBooking.findAll({ where: { invoice_id: invoice.id }, transaction: t });
    if (bookings.some((b) => b.status === 'fulfilled')) {
      throw badRequest('This sale has an item that was already delivered from a booking — reverse that delivery manually before refunding.');
    }

    // 1. Reverse every payment voucher (cash/knet/etc already collected).
    const payments = await InvoicePayment.findAll({ where: { invoice_id: invoice.id }, transaction: t });
    for (const p of payments) {
      if (p.voucher_id) await voucherService.cancelVoucher(companyId, p.voucher_id, t);
    }

    // 2. Reverse the main posting voucher — undoes AR/Revenue/Tax and
    // COGS/Inventory together, since they were posted on the same voucher.
    if (invoice.posting_voucher_id) {
      await voucherService.cancelVoucher(companyId, invoice.posting_voucher_id, t);
    }

    // 3. Restore physical stock for each line that actually issued it.
    for (const l of lines) {
      if (!l.item_id) continue;
      if (l.is_booked) continue; // still-pending: nothing was ever issued

      const movement = await InventoryTransaction.findOne({
        where: {
          reference_type: 'invoice', reference_id: invoice.id, item_id: l.item_id,
          variant_id: l.variant_id || null, type: 'sale',
        },
        transaction: t,
      });
      const unitCost = movement ? Number(movement.unit_cost) : 0;

      await itemService.receiveStock(companyId, l.item_id, {
        quantity: Number(l.quantity),
        unitCost,
        date: new Date().toISOString().slice(0, 10),
        referenceType: 'invoice',
        referenceId: invoice.id,
        userId,
        notes: `Refund of ${invoice.invoice_no}`,
        type: 'adjustment', // InventoryTransaction.type is a Postgres ENUM — reuse 'adjustment'
        // rather than adding a new enum value (risky under production's sync({alter:true})).
        // The notes/reference_type/reference_id fields make this movement traceable as a refund.
        branchId: invoice.branch_id,
        variantId: l.variant_id,
      }, t);
    }

    // Release any still-pending reservations, same as a plain cancel.
    await ItemBooking.update(
      { status: 'cancelled' },
      { where: { invoice_id: invoice.id, status: 'pending' }, transaction: t },
    );

    await invoice.update({
      status: 'cancelled',
      paid_total: 0,
      refunded_at: new Date(),
      refund_reason: reason || null,
      refunded_by: userId || null,
    }, { transaction: t });

    return invoice;
  });
}

module.exports = { createInvoice, postInvoice, recordPayment, cancelInvoice, refundInvoice, nextInvoiceNo, computeLine, buildInvoiceLines };
