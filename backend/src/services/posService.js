// Point-of-Sale layer. A POS sale is, underneath, an ordinary sales Invoice
// (same posting pipeline, same stock/COGS side-effects, same ledger) — this
// module just adds the till/shift accountability and the cashier-facing
// checkout flow (hold, split tender across Cash/Knet/Credit, void) on top of
// invoiceService, so nothing about the core accounting engine had to change.
const { sequelize, Invoice, InvoiceLine, InvoicePayment, PosShift, Client, FinancialSetting, UserCompany } = require('../models');
const { Op } = require('sequelize');
const invoiceService = require('./invoiceService');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Not found'); e.status = 404; return e; }
function forbidden(message) { const e = new Error(message || 'Not permitted'); e.status = 403; return e; }

// A user's POS access is independent of (but influenced by) their normal
// accounting role: a company admin or accountant is automatically treated as
// a POS "operator" (full POS capabilities) without needing to be configured
// separately, since they already have equivalent or greater trust elsewhere
// in the system. A dedicated POS cashier/operator account (pos_role set on
// UserCompany) can access POS regardless of their accounting role — this is
// how a low-privilege till user (no chart-of-accounts/voucher access) is
// meant to be set up.
const POS_ACTIONS = ['void', 'credit_sale', 'refund'];

async function getPosProfile(companyId, userId, isSuperAdmin, companyRole) {
  const uc = await UserCompany.findOne({ where: { company_id: companyId, user_id: userId } });
  const posRole = uc?.pos_role || 'none';
  const posPermissions = Array.isArray(uc?.pos_permissions) ? uc.pos_permissions : [];

  let level = null;
  if (isSuperAdmin || companyRole === 'admin') level = 'operator';
  else if (posRole === 'operator') level = 'operator';
  else if (companyRole === 'accountant') level = 'operator';
  else if (posRole === 'cashier') level = 'cashier';

  return {
    level, // null | 'cashier' | 'operator'
    posRole,
    posPermissions,
    hasAccess: level !== null,
    can(action) {
      if (level === 'operator') return true;
      if (level === 'cashier') return posPermissions.includes(action);
      return false;
    },
  };
}

async function getOpenShift(companyId, userId) {
  return PosShift.findOne({ where: { company_id: companyId, cashier_id: userId, status: 'open' } });
}

async function openShift(companyId, userId, { branch_id, opening_float }) {
  const existing = await getOpenShift(companyId, userId);
  if (existing) throw badRequest('You already have an open shift. Close it before opening a new one.');
  return PosShift.create({
    company_id: companyId,
    branch_id: branch_id || null,
    cashier_id: userId,
    opening_float: Number(opening_float || 0),
    status: 'open',
  });
}

async function closeShift(companyId, userId, shiftId, { counted_cash, notes }) {
  const shift = await PosShift.findOne({ where: { id: shiftId, company_id: companyId } });
  if (!shift) throw notFound('Shift not found');
  if (shift.status !== 'open') throw badRequest('This shift is already closed');
  if (shift.cashier_id !== userId) throw forbidden('Only the cashier who opened this shift can close it');

  // Aggregated as two plain queries (rather than a sum-across-include) so the
  // result doesn't depend on Sequelize/dialect quirks around joined sums.
  const invoiceIds = (await Invoice.findAll({ where: { pos_shift_id: shift.id }, attributes: ['id'] })).map((i) => i.id);
  const cashPayments = invoiceIds.length
    ? await InvoicePayment.findAll({ where: { invoice_id: { [Op.in]: invoiceIds }, payment_method: 'cash' } })
    : [];
  const cashTotal = cashPayments.reduce((s, p) => s + Number(p.amount), 0);

  const expected = Number(shift.opening_float) + cashTotal;
  const counted = Number(counted_cash || 0);
  await shift.update({
    status: 'closed',
    closed_at: new Date(),
    expected_cash: expected,
    counted_cash: counted,
    variance: counted - expected,
    notes: notes || shift.notes,
  });
  return shift;
}

async function listShifts(companyId, { branchId, status, cashierId } = {}) {
  const where = { company_id: companyId };
  if (branchId) where.branch_id = branchId;
  if (status && status !== 'all') where.status = status;
  if (cashierId) where.cashier_id = cashierId;
  return PosShift.findAll({ where, order: [['opened_at', 'DESC']] });
}

async function creditOutstanding(companyId, clientId, excludeInvoiceId) {
  const invoices = await Invoice.findAll({
    where: {
      company_id: companyId,
      client_id: clientId,
      status: { [Op.in]: ['posted', 'partially_paid'] },
      ...(excludeInvoiceId ? { id: { [Op.ne]: excludeInvoiceId } } : {}),
    },
  });
  return invoices.reduce((s, inv) => s + (Number(inv.total) - Number(inv.paid_total)), 0);
}

// Rings up a sale. `action` is 'hold' (save as an open draft, no posting, no
// payment — resumed later from the Held Sales list) or 'complete' (post the
// invoice immediately and settle it with the given `payments`).
// `payments` is an array of { method: 'cash'|'knet'|'credit'|'other', amount, reference, account_id }.
// A 'credit' payment simply leaves that portion of the invoice unpaid against
// the client's normal AR account — no separate ledger mechanism needed, it's
// exactly how any partially-paid invoice already behaves.
async function createSale(companyId, userId, posProfile, payload) {
  const { branch_id, client_id, lines, discount_code, notes, action, payments, cost_center_id, delivery_date, delivery_address, is_manufacture_order, manufacturer_id } = payload;

  const shift = await getOpenShift(companyId, userId);
  if (!shift) throw badRequest('Open a shift before starting a sale');

  const invoice = await invoiceService.createInvoice(companyId, userId, {
    type: 'sales',
    client_id,
    date: new Date().toISOString().slice(0, 10),
    branch_id: branch_id || shift.branch_id || null,
    cost_center_id: cost_center_id || null,
    notes,
    lines,
    discount_code,
    channel: 'pos',
    pos_shift_id: shift.id,
    delivery_date: delivery_date || null,
    delivery_address: delivery_address || null,
    is_manufacture_order: !!is_manufacture_order,
    manufacturer_id: manufacturer_id || null,
  });

  if (action === 'hold') return invoice;

  // Validate the credit tender BEFORE posting, so a rejected credit sale
  // leaves nothing behind — the draft invoice is simply discarded rather
  // than existing as an orphaned posted-but-unpaid sale the cashier didn't
  // mean to create.
  const hasCredit = (payments || []).some((p) => p.method === 'credit');
  if (hasCredit) {
    if (!posProfile.can('credit_sale')) {
      await invoice.destroy();
      throw forbidden('You are not permitted to sell on credit');
    }
    if (!client_id) {
      await invoice.destroy();
      throw badRequest('A client is required for a credit sale');
    }
    const client = await Client.findOne({ where: { id: client_id, company_id: companyId } });
    const creditAmount = (payments || []).filter((p) => p.method === 'credit').reduce((s, p) => s + Number(p.amount), 0);
    if (client && Number(client.credit_limit) > 0) {
      const outstanding = await creditOutstanding(companyId, client_id, invoice.id);
      if (outstanding + creditAmount > Number(client.credit_limit) + 0.001) {
        await invoice.destroy();
        throw badRequest(
          `This would put ${client.name_en} over their credit limit of ${Number(client.credit_limit).toFixed(3)} `
          + `(currently owes ${outstanding.toFixed(3)}, this sale adds ${creditAmount.toFixed(3)})`,
        );
      }
    }
  }

  const posted = await invoiceService.postInvoice(companyId, invoice.id, userId);

  const settings = await FinancialSetting.findOne({ where: { company_id: companyId } });
  for (const p of (payments || [])) {
    if (p.method === 'credit') continue; // leaves this amount as invoice AR balance
    const amount = Number(p.amount);
    if (amount <= 0) continue;
    let account_id = p.account_id || null;
    if (!account_id && p.method === 'cash') account_id = settings?.pos_cash_account_id || null;
    if (!account_id && p.method === 'knet') account_id = settings?.pos_knet_account_id || null;
    if (!account_id) {
      throw badRequest(
        `No default account configured for ${p.method} payments — set it up in Financial Configuration first`,
      );
    }
    await invoiceService.recordPayment(companyId, posted.id, userId, {
      amount,
      date: new Date().toISOString().slice(0, 10),
      cash_account_id: account_id,
      payment_method: p.method === 'other' ? 'other' : p.method,
      reference: p.reference || null,
    });
  }

  return Invoice.findOne({ where: { id: posted.id, company_id: companyId } });
}

// Void: only for sales that never collected money. A draft (held, not yet
// posted) sale is simply deleted. A posted-but-unpaid sale is cancelled the
// normal way. A sale that already has a payment recorded is NOT voidable
// here — that needs a proper return/refund flow, out of scope for this round.
async function voidSale(companyId, userId, posProfile, invoiceId) {
  if (!posProfile.can('void')) throw forbidden('You are not permitted to void a sale');

  const invoice = await Invoice.findOne({ where: { id: invoiceId, company_id: companyId } });
  if (!invoice) throw notFound('Sale not found');

  if (invoice.status === 'draft') {
    await invoice.destroy();
    return { id: invoiceId, status: 'voided' };
  }
  if (invoice.status === 'posted' && Number(invoice.paid_total) === 0) {
    return invoiceService.cancelInvoice(companyId, invoiceId);
  }
  throw badRequest('This sale already has a payment recorded — void is not available. Process a return instead.');
}

async function heldSales(companyId, userId) {
  return Invoice.findAll({
    where: { company_id: companyId, channel: 'pos', status: 'draft', created_by: userId },
    order: [['created_at', 'DESC']],
    include: [{ association: 'client' }, { model: InvoiceLine, as: 'lines' }],
  });
}

// Backs the POS toolbar's "Invoices By Date" + "Customer" lookup: every
// completed (non-draft) POS-channel sale, filterable by date range, a
// specific client, status, or a free-text `q` that matches an invoice number
// or a customer's name/phone — so a cashier can find "the sale for the guy
// who called about his phone number" without leaving the POS screen.
async function salesHistory(companyId, { date_from, date_to, client_id, status, q } = {}) {
  const where = { company_id: companyId, channel: 'pos' };
  where.status = status && status !== 'all' ? status : { [Op.ne]: 'draft' };
  if (client_id) where.client_id = client_id;
  if (date_from || date_to) {
    where.date = {};
    if (date_from) where.date[Op.gte] = date_from;
    if (date_to) where.date[Op.lte] = date_to;
  }
  if (q) {
    const matchingClients = await Client.findAll({
      where: {
        company_id: companyId,
        [Op.or]: [
          { phone: { [Op.iLike]: `%${q}%` } },
          { name_en: { [Op.iLike]: `%${q}%` } },
          { name_ar: { [Op.iLike]: `%${q}%` } },
        ],
      },
      attributes: ['id'],
    });
    const clientIds = matchingClients.map((c) => c.id);
    where[Op.or] = [
      { invoice_no: { [Op.iLike]: `%${q}%` } },
      ...(clientIds.length ? [{ client_id: { [Op.in]: clientIds } }] : []),
    ];
  }

  return Invoice.findAll({
    where,
    order: [['date', 'DESC'], ['created_at', 'DESC']],
    include: [
      { association: 'client' },
      { model: InvoiceLine, as: 'lines' },
      { model: InvoicePayment, as: 'payments' },
    ],
  });
}

// Refund: reverses a completed POS sale in full — see
// invoiceService.refundInvoice for the actual reversal mechanics (payments,
// posting voucher, stock). This layer only adds the POS permission gate and
// scopes the lookup to this company's POS sales.
async function refundSale(companyId, userId, posProfile, invoiceId, { reason } = {}) {
  if (!posProfile.can('refund')) throw forbidden('You are not permitted to process refunds');
  const invoice = await Invoice.findOne({ where: { id: invoiceId, company_id: companyId, channel: 'pos' } });
  if (!invoice) throw notFound('Sale not found');
  return invoiceService.refundInvoice(companyId, userId, invoiceId, { reason });
}

module.exports = {
  POS_ACTIONS,
  getPosProfile,
  getOpenShift,
  openShift,
  closeShift,
  listShifts,
  createSale,
  voidSale,
  heldSales,
  salesHistory,
  refundSale,
  creditOutstanding,
};
