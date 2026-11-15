// Sales Returns (credit notes) — the partial-refund cycle.
//
// One return = one reversing journal voucher + (optionally) a payout voucher:
//   Dr Revenue / Dr Tax payable      (what was sold, for just the returned part)
//     Cr Client A/R                  (total returned)
//   Dr Inventory / Cr COGS           (only for lines sent back to sellable stock)
// Then the money is settled in this order: (1) reduce what the client still owes on
// that invoice, (2) pay the rest back out (cash / KNET -> Dr A/R, Cr cash account),
// or (3) leave it as client credit on their A/R account.
// Goods marked "damaged" are NOT restocked and keep their COGS charge (the loss stays
// in expenses) — they are logged in Damaged Stock so the Damaged report shows them.
const { Op } = require('sequelize');
const {
  sequelize, Invoice, InvoiceLine, InventoryTransaction, Item, Client, FinancialSetting, ItemDamage,
  SalesReturn, SalesReturnLine,
} = require('../models');
const voucherService = require('./voucherService');
const itemService = require('./itemService');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Not found'); e.status = 404; return e; }
const r3 = (v) => Math.round(Number(v || 0) * 1000) / 1000;

async function nextReturnNo(companyId, t) {
  const count = await SalesReturn.count({ where: { company_id: companyId }, transaction: t });
  return `RET-${String(count + 1).padStart(6, '0')}`;
}

// Already-returned totals per invoice line.
async function returnedByLine(invoiceId, t) {
  const rows = await SalesReturnLine.findAll({
    include: [{ model: SalesReturn, as: 'salesReturn', attributes: [], where: { invoice_id: invoiceId }, required: true }],
    transaction: t,
  });
  const map = new Map();
  rows.forEach((r) => {
    const m = map.get(r.invoice_line_id) || { qty: 0, subtotal: 0, tax: 0 };
    m.qty += Number(r.quantity); m.subtotal += Number(r.line_subtotal); m.tax += Number(r.line_tax);
    map.set(r.invoice_line_id, m);
  });
  return map;
}

// What can still be returned on an invoice, line by line (drives the Return dialog).
async function returnable(companyId, invoiceId) {
  const invoice = await Invoice.findOne({ where: { id: invoiceId, company_id: companyId } });
  if (!invoice) throw notFound('Invoice not found');
  const lines = await InvoiceLine.findAll({ where: { invoice_id: invoiceId }, include: [{ model: Item, as: 'item' }], order: [['line_order', 'ASC']] });
  const done = await returnedByLine(invoiceId);
  return {
    invoice: {
      id: invoice.id, invoice_no: invoice.invoice_no, status: invoice.status, total: Number(invoice.total), paid_total: Number(invoice.paid_total),
      returned_total: Number(invoice.returned_total || 0), client_id: invoice.client_id, branch_id: invoice.branch_id,
    },
    eligible: invoice.type === 'sales' && ['posted', 'partially_paid', 'paid'].includes(invoice.status),
    lines: lines.map((l) => {
      const d = done.get(l.id) || { qty: 0 };
      const qty = Number(l.quantity);
      return {
        id: l.id, description: l.description, item_id: l.item_id, code: l.item?.code || null, name_en: l.item?.name_en || null, name_ar: l.item?.name_ar || null,
        quantity: qty, returned_quantity: d.qty, remaining_quantity: Math.max(0, qty - d.qty), unit_price: Number(l.unit_price),
        line_total: Number(l.line_total), is_booked: !!l.is_booked, is_manufacture_item: !!l.manufacture_item_id, has_stock: !!l.item_id,
      };
    }),
  };
}

async function createReturn(companyId, userId, payload) {
  const { invoice_id, lines: inLines, reason, refund_method, refund_account_id, pos_shift_id } = payload;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(payload.date || '') ? payload.date : new Date().toISOString().slice(0, 10);
  const wanted = (inLines || []).filter((l) => Number(l.quantity) > 0);
  if (!wanted.length) throw badRequest('Choose at least one line and a quantity to return');
  const method = ['cash', 'knet', 'other', 'credit'].includes(refund_method) ? refund_method : 'cash';

  return sequelize.transaction(async (t) => {
    const invoice = await Invoice.findOne({ where: { id: invoice_id, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!invoice) throw notFound('Invoice not found');
    if (invoice.type !== 'sales') throw badRequest('Only sales invoices can be returned');
    if (!['posted', 'partially_paid', 'paid'].includes(invoice.status)) throw badRequest('Only a posted sales invoice can be returned');
    const client = invoice.client_id ? await Client.findByPk(invoice.client_id, { transaction: t }) : null;
    if (!client?.account_id) throw badRequest('The invoice client has no linked GL account');

    const invLines = await InvoiceLine.findAll({ where: { invoice_id: invoice.id }, transaction: t });
    const done = await returnedByLine(invoice.id, t);
    const useSeparateTax = !!invoice.tax_account_id && Number(invoice.tax_total) > 0.001;

    const prepared = [];
    for (const w of wanted) {
      const il = invLines.find((x) => x.id === w.invoice_line_id);
      if (!il) throw badRequest('A selected line does not belong to this invoice');
      if (il.is_booked) throw badRequest(`"${il.description}" is a booked line — cancel the booking instead of returning it`);
      const prev = done.get(il.id) || { qty: 0, subtotal: 0, tax: 0 };
      const qty = Number(w.quantity);
      const remaining = Number(il.quantity) - prev.qty;
      if (qty > remaining + 0.0005) throw badRequest(`"${il.description}": only ${remaining} left to return`);
      const isFinal = Math.abs(qty - remaining) < 0.0005; // last piece takes the rounding remainder
      const subtotal = isFinal ? r3(Number(il.line_subtotal) - prev.subtotal) : r3((Number(il.line_subtotal) * qty) / Number(il.quantity));
      const tax = isFinal ? r3(Number(il.line_tax) - prev.tax) : r3((Number(il.line_tax) * qty) / Number(il.quantity));
      const disposition = w.disposition === 'damaged' ? 'damaged' : 'restock';

      let unitCost = 0;
      if (il.item_id) {
        const mv = await InventoryTransaction.findOne({
          where: { reference_type: 'invoice', reference_id: invoice.id, item_id: il.item_id, variant_id: il.variant_id || null, type: 'sale' }, transaction: t,
        });
        unitCost = mv ? Number(mv.unit_cost) : 0;
      }
      prepared.push({ il, qty, subtotal, tax, total: r3(subtotal + tax), disposition, unitCost });
    }

    const subtotalSum = r3(prepared.reduce((s, p) => s + p.subtotal, 0));
    const taxSum = r3(prepared.reduce((s, p) => s + p.tax, 0));
    const R = r3(subtotalSum + taxSum);
    if (R <= 0) throw badRequest('Nothing to return');

    const ret = await SalesReturn.create({
      company_id: companyId, return_no: await nextReturnNo(companyId, t), invoice_id: invoice.id, client_id: invoice.client_id,
      branch_id: invoice.branch_id, pos_shift_id: pos_shift_id || null, date, reason: reason || null,
      subtotal: subtotalSum, tax_total: taxSum, total: R, refund_method: method, created_by: userId,
    }, { transaction: t });

    // ---- reversing journal voucher ----
    const vLines = [];
    const desc = `${ret.return_no} (return on ${invoice.invoice_no})`;
    prepared.forEach((p) => {
      vLines.push({ account_id: p.il.account_id, debit: useSeparateTax ? p.subtotal : r3(p.subtotal + p.tax), credit: 0, description: p.il.description || desc });
    });
    if (useSeparateTax && taxSum > 0) vLines.push({ account_id: invoice.tax_account_id, debit: taxSum, credit: 0, description: `Tax on ${desc}` });
    vLines.push({ account_id: client.account_id, debit: 0, credit: R, description: desc, client_id: invoice.client_id });

    let mfgReduce = 0;
    for (const p of prepared) {
      const il = p.il;
      await SalesReturnLine.create({
        return_id: ret.id, invoice_line_id: il.id, item_id: il.item_id, variant_id: il.variant_id || null, description: il.description,
        quantity: p.qty, unit_price: il.unit_price, line_subtotal: p.subtotal, line_tax: p.tax, line_total: p.total,
        disposition: il.item_id ? p.disposition : 'restock', unit_cost: p.unitCost,
      }, { transaction: t });

      if (il.manufacture_item_id) mfgReduce += p.qty * Number(il.manufacture_unit_cost || 0);
      if (!il.item_id) continue;
      const item = await Item.findByPk(il.item_id, { transaction: t });

      if (p.disposition === 'damaged') {
        await ItemDamage.create({
          company_id: companyId, item_id: il.item_id, variant_id: il.variant_id || null, branch_id: invoice.branch_id, quantity: p.qty,
          unit_cost: p.unitCost, damage_type: 'customer_return', status: 'cleared', notes: `Returned damaged — ${ret.return_no}`,
          reported_by: userId, cleared_by: userId, cleared_at: new Date(),
        }, { transaction: t });
        continue; // goods are lost: no stock back, COGS stays as the write-off
      }
      await itemService.receiveStock(companyId, il.item_id, {
        quantity: p.qty, unitCost: p.unitCost, date, referenceType: 'sales_return', referenceId: ret.id, userId,
        notes: `Return ${ret.return_no} of ${invoice.invoice_no}`, type: 'adjustment', branchId: invoice.branch_id, variantId: il.variant_id,
      }, t);
      const cost = r3(p.qty * p.unitCost);
      if (cost > 0.0009) {
        vLines.push({ account_id: item.inventory_account_id, debit: cost, credit: 0, description: `Restock - ${item.name_en} (${ret.return_no})` });
        vLines.push({ account_id: item.cogs_account_id, debit: 0, credit: cost, description: `Restock - ${item.name_en} (${ret.return_no})` });
      }
    }

    const voucher = await voucherService.createVoucher(companyId, userId, {
      voucher_type: 'journal', date, description: `Sales Return ${ret.return_no} — ${invoice.invoice_no}`,
      cost_center_id: invoice.cost_center_id, branch_id: invoice.branch_id, currency: invoice.currency, lines: vLines,
    }, t);
    await voucherService.postVoucher(companyId, voucher.id, t);

    // ---- settle the money ----
    const outstanding = Math.max(0, Number(invoice.total) - Number(invoice.paid_total));
    const offset = r3(Math.min(R, outstanding));
    const remainder = r3(R - offset);
    let refunded = 0; let credited = 0; let refundVoucherId = null;
    if (remainder > 0.0005) {
      if (method === 'credit') {
        credited = remainder; // stays as a credit balance on the client's A/R account
      } else {
        let accountId = refund_account_id;
        if (!accountId) {
          const fs = await FinancialSetting.findOne({ where: { company_id: companyId }, transaction: t });
          accountId = method === 'knet' ? fs?.pos_knet_account_id : fs?.pos_cash_account_id;
        }
        if (!accountId) throw badRequest(`No ${method === 'knet' ? 'KNET' : 'cash'} account configured to pay the refund from — set it in Financial Configuration or pick an account`);
        const pv = await voucherService.createVoucher(companyId, userId, {
          voucher_type: 'payment', date, description: `Refund ${ret.return_no} — ${invoice.invoice_no}`, branch_id: invoice.branch_id,
          lines: [
            { account_id: client.account_id, debit: remainder, credit: 0, description: `Refund ${ret.return_no}`, client_id: invoice.client_id },
            { account_id: accountId, debit: 0, credit: remainder, description: `Refund ${ret.return_no}`, client_id: invoice.client_id },
          ],
        }, t);
        await voucherService.postVoucher(companyId, pv.id, t);
        refunded = remainder; refundVoucherId = pv.id;
      }
    }

    const newPaid = r3(Number(invoice.paid_total) + offset);
    await invoice.update({
      paid_total: newPaid, returned_total: r3(Number(invoice.returned_total || 0) + R),
      status: newPaid >= Number(invoice.total) - 0.001 ? 'paid' : (newPaid > 0 ? 'partially_paid' : 'posted'),
      manufacture_cost: Math.max(0, r3(Number(invoice.manufacture_cost || 0) - mfgReduce)),
    }, { transaction: t });

    await ret.update({ voucher_id: voucher.id, refund_voucher_id: refundVoucherId, applied_to_invoice: offset, refunded_amount: refunded, credited_amount: credited }, { transaction: t });
    return ret;
  });
}

async function getReturn(companyId, id) {
  const ret = await SalesReturn.findOne({
    where: { id, company_id: companyId },
    include: [{ model: SalesReturnLine, as: 'lines', include: [{ model: Item, as: 'item' }] }, { model: Invoice, as: 'invoice' }, { model: Client, as: 'client' }],
  });
  if (!ret) throw notFound('Return not found');
  return ret;
}

async function listReturns(companyId, { from, to, branch_id, invoice_id } = {}) {
  const where = { company_id: companyId };
  if (branch_id) where.branch_id = branch_id;
  if (invoice_id) where.invoice_id = invoice_id;
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  return SalesReturn.findAll({
    where, order: [['date', 'DESC'], ['created_at', 'DESC']], limit: 1000,
    include: [{ model: Invoice, as: 'invoice', attributes: ['id', 'invoice_no', 'channel'] }, { model: Client, as: 'client', attributes: ['id', 'name_en', 'name_ar'] }],
  });
}

module.exports = { createReturn, returnable, getReturn, listReturns };
