// Warranty replacements and exchanges.
//  - Replacement (in warranty): the defective unit comes back (logged as damaged, not restocked);
//    a fresh unit goes out at cost, expensed to the damage/warranty expense account.
//  - Exchange: the old item is credited (a Sales Return credit note at the price the client paid),
//    the new item is sold on a new invoice, the credit pays for it, and only the DIFFERENCE moves
//    money: the client pays the extra, or is refunded / keeps credit for the surplus.
const { sequelize, Invoice, InvoiceLine, Item, Client, FinancialSetting, ItemDamage, WarrantyClaim, InventoryTransaction } = require('../models');
const { Op } = require('sequelize');
const voucherService = require('./voucherService');
const itemService = require('./itemService');
const invoiceService = require('./invoiceService');
const salesReturnService = require('./salesReturnService');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Not found'); e.status = 404; return e; }
const r3 = (v) => Math.round(Number(v || 0) * 1000) / 1000;
const today = () => new Date().toISOString().slice(0, 10);

async function nextClaimNo(companyId, t) {
  const count = await WarrantyClaim.count({ where: { company_id: companyId }, transaction: t });
  return `WAR-${String(count + 1).padStart(6, '0')}`;
}

// Claimed so far per invoice line (replacements + exchanges), so one sold unit can't be claimed twice.
async function claimedQty(lineId) {
  const rows = await WarrantyClaim.findAll({ where: { invoice_line_id: lineId, status: 'completed' } });
  return rows.reduce((s, r) => s + Number(r.quantity), 0);
}

// Find an invoice by number (or id) and describe each line's warranty position.
async function lookup(companyId, { invoice_no, invoice_id }) {
  const where = { company_id: companyId, type: 'sales' };
  if (invoice_id) where.id = invoice_id; else where.invoice_no = String(invoice_no || '').trim().toUpperCase();
  const invoice = await Invoice.findOne({ where, include: [{ model: Client, as: 'client' }] });
  if (!invoice) throw notFound('Sales invoice not found');
  const lines = await InvoiceLine.findAll({ where: { invoice_id: invoice.id }, include: [{ model: Item, as: 'item' }], order: [['line_order', 'ASC']] });
  const out = [];
  for (const l of lines) {
    if (!l.item_id) continue;
    const claimed = await claimedQty(l.id);
    out.push({
      id: l.id, item_id: l.item_id, code: l.item?.code, name_en: l.item?.name_en, name_ar: l.item?.name_ar, quantity: Number(l.quantity),
      unit_paid: Number(l.quantity) ? Number(l.line_total) / Number(l.quantity) : 0, is_gift: !!l.is_gift, is_booked: !!l.is_booked,
      warranty_months: l.warranty_months || 0, warranty_expires: l.warranty_expires,
      in_warranty: !!(l.warranty_expires && l.warranty_expires >= today()),
      claimed_quantity: claimed, claimable_quantity: Math.max(0, Number(l.quantity) - claimed),
    });
  }
  return {
    invoice: { id: invoice.id, invoice_no: invoice.invoice_no, date: invoice.date, status: invoice.status, client_id: invoice.client_id, client_name: invoice.client?.name_en, branch_id: invoice.branch_id },
    lines: out,
  };
}

async function replacement(companyId, userId, p) {
  const { line, qty, reason, isSuper, override } = p;
  const inWarranty = !!(line.warranty_expires && line.warranty_expires >= today());
  if (!inWarranty && !(override && isSuper)) throw badRequest('This item is out of warranty — only the super admin can approve it as an exception');
  return sequelize.transaction(async (t) => {
    const invoice = await Invoice.findByPk(line.invoice_id, { transaction: t });
    const claim_no = await nextClaimNo(companyId, t);
    const claim = await WarrantyClaim.create({
      company_id: companyId, claim_no, type: 'replacement', invoice_id: invoice.id, invoice_line_id: line.id, client_id: invoice.client_id, branch_id: invoice.branch_id,
      item_id: line.item_id, quantity: qty, reason: reason || null, in_warranty: inWarranty, warranty_override: !inWarranty, new_item_id: line.item_id, created_by: userId,
    }, { transaction: t });
    // Fresh unit out of stock at cost.
    const { item, cogsAmount } = await itemService.issueStock(companyId, line.item_id, {
      quantity: qty, date: today(), referenceType: 'warranty', referenceId: claim.id, userId, type: 'adjustment',
      notes: `Warranty replacement ${claim_no} (${invoice.invoice_no})`, branchId: null, variantId: line.variant_id,
    }, t);
    // Defective unit comes back: logged as damaged (supplier claim / scrap), never re-sold.
    await ItemDamage.create({
      company_id: companyId, item_id: line.item_id, variant_id: line.variant_id || null, branch_id: null, quantity: qty,
      unit_cost: qty ? r3(cogsAmount / qty) : 0, damage_type: 'manufacturing_defect', status: 'cleared',
      notes: `Defective unit returned — ${claim_no}`, reported_by: userId, cleared_by: userId, cleared_at: new Date(),
    }, { transaction: t });
    let voucherId = null;
    if (cogsAmount > 0.0009) {
      const fs = await FinancialSetting.findOne({ where: { company_id: companyId }, transaction: t });
      const v = await voucherService.createVoucher(companyId, userId, {
        voucher_type: 'journal', date: today(), description: `Warranty replacement ${claim_no} — ${invoice.invoice_no}`, branch_id: invoice.branch_id,
        lines: [
          { account_id: fs?.damage_expense_account_id || item.cogs_account_id, debit: cogsAmount, credit: 0, description: `Warranty replacement - ${item.name_en}` },
          { account_id: item.inventory_account_id, debit: 0, credit: cogsAmount, description: `Warranty replacement - ${item.name_en}` },
        ],
      }, t);
      await voucherService.postVoucher(companyId, v.id, t);
      voucherId = v.id;
    }
    await claim.update({ replacement_cost: cogsAmount, voucher_id: voucherId }, { transaction: t });
    return claim;
  });
}

async function exchange(companyId, userId, p) {
  const { line, qty, reason, isSuper, override, new_item_id, new_unit_price, new_quantity, settlement_method, refund_account_id, pos_shift_id, salesperson_id } = p;
  const inWarranty = !!(line.warranty_expires && line.warranty_expires >= today());
  if (!new_item_id) throw badRequest('Choose the item the client wants instead');
  const method = ['cash', 'knet', 'other', 'credit'].includes(settlement_method) ? settlement_method : 'cash';
  const newItem = await Item.findOne({ where: { id: new_item_id, company_id: companyId } });
  if (!newItem) throw badRequest('Unknown replacement item');
  const newQty = Number(new_quantity || qty);
  const unitPrice = new_unit_price !== undefined && new_unit_price !== '' ? Number(new_unit_price) : Number(newItem.selling_price || 0);
  if (!(unitPrice >= 0)) throw badRequest('Invalid price');
  const sourceInvoice = await Invoice.findByPk(line.invoice_id);

  // 1) The new item is sold on its own invoice (posted, not yet paid).
  const draft = await invoiceService.createInvoice(companyId, userId, {
    type: 'sales', client_id: sourceInvoice.client_id, date: today(), branch_id: sourceInvoice.branch_id, channel: sourceInvoice.channel === 'pos' ? 'pos' : 'backoffice',
    pos_shift_id: pos_shift_id || null, salesperson_id: salesperson_id || sourceInvoice.salesperson_id || null, currency: sourceInvoice.currency,
    notes: `Exchange for ${sourceInvoice.invoice_no}${reason ? ` — ${reason}` : ''}`,
    lines: [{ item_id: newItem.id, account_id: newItem.income_account_id, description: newItem.name_en, quantity: newQty, unit_price: unitPrice }],
  });
  const newInv = await invoiceService.postInvoice(companyId, draft.id, userId);

  let ret = null;
  try {
    // 2) The old item is credited at the price the client paid; the credit pays for the new item first.
    ret = await salesReturnService.createReturn(companyId, userId, {
      invoice_id: sourceInvoice.id, lines: [{ invoice_line_id: line.id, quantity: qty, disposition: p.returned_disposition === 'damaged' ? 'damaged' : 'restock' }],
      reason: `Exchange ${reason || ''}`.trim(), refund_method: method, refund_account_id, pos_shift_id, auto_confirm: isSuper,
      settle_against_invoice_id: newInv.id,
    });
  } catch (e) {
    await invoiceService.cancelInvoice(companyId, newInv.id); // nothing was paid yet — undo the new sale
    throw e;
  }

  // 3) Whatever the credit did not cover is paid by the client now.
  const fresh = await Invoice.findByPk(newInv.id);
  const due = r3(Number(fresh.total) - Number(fresh.paid_total));
  if (due > 0.0005) {
    if (method === 'credit') {
      // left on the client's account (they pay later)
    } else {
      const fs = await FinancialSetting.findOne({ where: { company_id: companyId } });
      const accountId = refund_account_id || (method === 'knet' ? fs?.pos_knet_account_id : fs?.pos_cash_account_id);
      if (!accountId) throw badRequest('No cash/KNET account configured to take the difference — the exchange was recorded; collect the balance on the new invoice');
      await invoiceService.recordPayment(companyId, newInv.id, userId, { amount: due, date: today(), cash_account_id: accountId, payment_method: method });
    }
  }
  const difference = r3(Number(fresh.total) - Number(ret.total)); // >0 client paid, <0 client got back

  return sequelize.transaction(async (t) => WarrantyClaim.create({
    company_id: companyId, claim_no: await nextClaimNo(companyId, t), type: 'exchange', invoice_id: sourceInvoice.id, invoice_line_id: line.id, client_id: sourceInvoice.client_id, branch_id: sourceInvoice.branch_id,
    item_id: line.item_id, quantity: qty, reason: reason || null, in_warranty: inWarranty, warranty_override: !inWarranty && !!override, new_item_id: newItem.id, new_unit_price: unitPrice,
    credit_amount: ret.total, new_total: fresh.total, price_difference: difference, settlement_method: method, return_id: ret.id, new_invoice_id: newInv.id, created_by: userId,
  }, { transaction: t }));
}

async function createClaim(companyId, userId, body, ctx) {
  const { type, invoice_line_id, quantity, reason } = body;
  if (!['replacement', 'exchange'].includes(type)) throw badRequest('type must be replacement or exchange');
  const line = await InvoiceLine.findOne({ where: { id: invoice_line_id }, include: [{ model: Invoice, as: 'invoice', where: { company_id: companyId, type: 'sales' } }] });
  if (!line) throw notFound('Invoice line not found');
  if (!line.item_id) throw badRequest('Only stock items can be claimed');
  if (!['posted', 'partially_paid', 'paid'].includes(line.invoice.status)) throw badRequest('The invoice must be posted');
  if (line.is_booked) {
    const pending = await require('../models').ItemBooking.count({ where: { invoice_line_id: line.id, status: 'pending' } });
    if (pending) throw badRequest('This line still has undelivered booked units — release them with a return first');
  }
  const qty = Number(quantity);
  if (!(qty > 0)) throw badRequest('Enter the quantity');
  const remaining = Number(line.quantity) - (await claimedQty(line.id));
  if (qty > remaining + 0.0005) throw badRequest(`Only ${remaining} unit(s) of this line can still be claimed`);
  const common = { ...body, line, qty, reason, isSuper: ctx.isSuper, override: !!body.override, pos_shift_id: ctx.shiftId };
  return type === 'replacement' ? replacement(companyId, userId, common) : exchange(companyId, userId, common);
}

async function listClaims(companyId, { from, to, invoice_id } = {}) {
  const where = { company_id: companyId };
  if (invoice_id) where.invoice_id = invoice_id;
  if (from || to) where.createdAt = { ...(from && { [Op.gte]: `${from}T00:00:00` }), ...(to && { [Op.lte]: `${to}T23:59:59` }) };
  const rows = await WarrantyClaim.findAll({ where, order: [['created_at', 'DESC']], limit: 1000 });
  const items = await Item.findAll({ where: { id: [...new Set(rows.flatMap((r) => [r.item_id, r.new_item_id]).filter(Boolean))] }, attributes: ['id', 'code', 'name_en', 'name_ar'] });
  const invs = await Invoice.findAll({ where: { id: [...new Set(rows.flatMap((r) => [r.invoice_id, r.new_invoice_id]).filter(Boolean))] }, attributes: ['id', 'invoice_no'] });
  return rows.map((r) => ({
    ...r.toJSON(), item: items.find((i) => i.id === r.item_id) || null, new_item: items.find((i) => i.id === r.new_item_id) || null,
    invoice_no: invs.find((i) => i.id === r.invoice_id)?.invoice_no, new_invoice_no: invs.find((i) => i.id === r.new_invoice_id)?.invoice_no,
  }));
}

module.exports = { lookup, createClaim, listClaims };
