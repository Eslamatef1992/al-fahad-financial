const { sequelize, Client, Account, Company } = require('../models');
const crudFactory = require('../utils/crudFactory');
const { createLinkedAccount, syncLinkedAccount } = require('../utils/linkedAccount');
const { nextCode } = require('../utils/codeGenerator');
const { exportClients } = require('../services/excelService');
const { generateClientsPdf } = require('../services/pdfService');

const base = crudFactory(Client, { include: [{ model: Account, as: 'account' }], searchFields: ['name_en', 'name_ar', 'code', 'phone', 'email'] });

exports.list = base.list;
exports.get = base.get;
exports.remove = base.remove;

exports.exportExcel = async (req, res) => {
  const rows = await Client.findAll({ where: { company_id: req.companyId, is_active: true }, include: [{ model: Account, as: 'account' }], order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  await exportClients(res, company, rows);
};

exports.pdf = async (req, res) => {
  const rows = await Client.findAll({ where: { company_id: req.companyId, is_active: true }, include: [{ model: Account, as: 'account' }], order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  generateClientsPdf(res, rows, company);
};

// Creating a client always gets a system-generated code (CLI-00001, CLI-00002, ...) —
// any client-supplied code is ignored, same reasoning as Employees: no manual numbering
// scheme to get wrong or collide on. It can optionally also auto-create its ledger
// sub-account nested directly under a chosen control account (e.g. Accounts Receivable),
// using that generated code.
exports.create = async (req, res) => {
  const { parent_account_id, code, ...body } = req.body;
  const created = await sequelize.transaction(async (t) => {
    const finalCode = await nextCode(Client, req.companyId, 'CLI');
    let account_id = null;
    if (parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId,
        parentAccountId: parent_account_id,
        code: finalCode,
        name_en: body.name_en,
        name_ar: body.name_ar,
        opening_balance: body.opening_balance,
      }, t);
      account_id = account.id;
    }
    return Client.create({ ...body, code: finalCode, account_id, company_id: req.companyId }, { transaction: t });
  });
  const withAccount = await Client.findOne({ where: { id: created.id }, include: [{ model: Account, as: 'account' }] });
  res.status(201).json(withAccount);
};

exports.update = async (req, res) => {
  const { parent_account_id, code, ...body } = req.body; // code is immutable after creation
  const item = await Client.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Not found' });

  await sequelize.transaction(async (t) => {
    let account_id = item.account_id;
    if (!account_id && parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: parent_account_id,
        code: item.code, name_en: body.name_en, name_ar: body.name_ar, opening_balance: body.opening_balance,
      }, t);
      account_id = account.id;
    } else if (account_id) {
      await syncLinkedAccount(account_id, {
        name_en: body.name_en, name_ar: body.name_ar,
        opening_balance: body.opening_balance, parent_id: parent_account_id,
      }, t);
    }
    await item.update({ ...body, account_id }, { transaction: t });
  });

  const updated = await Client.findOne({ where: { id: item.id }, include: [{ model: Account, as: 'account' }] });
  res.json(updated);
};

// Account statement (كشف حساب): every posted ledger movement on the client's
// control account, with a running balance (debit = client owes more).
exports.statement = async (req, res) => {
  const { Op } = require('sequelize');
  const { LedgerEntry, Voucher, Branch, Invoice, InvoicePayment, SalesReturn } = require('../models');
  const client = await Client.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!client) return res.status(404).json({ message: 'Client not found' });
  const company = await Company.findByPk(req.companyId);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : null;
  const empty = { client: { id: client.id, code: client.code, name_en: client.name_en, name_ar: client.name_ar, phone: client.phone }, company: { name_en: company?.name_en, name_ar: company?.name_ar }, from, to, rows: [], totals: { debit: 0, credit: 0, balance: 0 } };
  if (!client.account_id) return res.json(empty);

  const r3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;
  const entries = await LedgerEntry.findAll({
    where: { company_id: req.companyId, account_id: client.account_id, ...(to ? { date: { [Op.lte]: to } } : {}) },
    include: [{ model: Branch, as: 'branch', attributes: ['code', 'name_en', 'name_ar'] }],
    order: [['date', 'ASC'], ['createdAt', 'ASC']],
  });
  const vIds = [...new Set(entries.map((e) => e.voucher_id))];
  const vouchers = vIds.length ? await Voucher.findAll({ where: { id: { [Op.in]: vIds } }, attributes: ['id', 'voucher_no', 'voucher_type', 'description', 'branch_id'] }) : [];
  const vMap = Object.fromEntries(vouchers.map((v) => [v.id, v]));
  const invs = vIds.length ? await Invoice.findAll({ where: { company_id: req.companyId, posting_voucher_id: { [Op.in]: vIds } }, attributes: ['posting_voucher_id', 'invoice_no'], raw: true }) : [];
  const invByV = Object.fromEntries(invs.map((i) => [i.posting_voucher_id, i.invoice_no]));
  const pays = vIds.length ? await InvoicePayment.findAll({ where: { voucher_id: { [Op.in]: vIds } }, attributes: ['voucher_id', 'invoice_id'], raw: true }) : [];
  const payInv = pays.length ? await Invoice.findAll({ where: { id: { [Op.in]: pays.map((x) => x.invoice_id) } }, attributes: ['id', 'invoice_no'], raw: true }) : [];
  const invNo = Object.fromEntries(payInv.map((i) => [i.id, i.invoice_no]));
  const payByV = Object.fromEntries(pays.map((p) => [p.voucher_id, invNo[p.invoice_id]]));
  const rets = vIds.length ? await SalesReturn.findAll({ where: { company_id: req.companyId, [Op.or]: [{ voucher_id: { [Op.in]: vIds } }, { refund_voucher_id: { [Op.in]: vIds } }] }, attributes: ['voucher_id', 'refund_voucher_id', 'return_no'], raw: true }).catch(() => []) : [];
  const retByV = {};
  rets.forEach((x) => { if (x.voucher_id) retByV[x.voucher_id] = x.return_no; if (x.refund_voucher_id) retByV[x.refund_voucher_id] = x.return_no; });

  let bal = 0; let opening = 0; const rows = []; let td = 0; let tc = 0;
  for (const e of entries) {
    const d = r3(e.debit); const c = r3(e.credit);
    bal = r3(bal + d - c);
    if (from && String(e.date) < from) { opening = bal; continue; }
    const v = vMap[e.voucher_id] || {};
    const bill = invByV[e.voucher_id] || payByV[e.voucher_id] || retByV[e.voucher_id] || (String(e.description || v.description || '').match(/[A-Z]{2,4}-\d+/) || [])[0] || v.voucher_no || '';
    let type; let type_ar;
    if (invByV[e.voucher_id]) { type = 'Sales on account'; type_ar = 'مبيعات بالحساب'; }
    else if (retByV[e.voucher_id]) { type = 'Return / refund'; type_ar = 'مرتجع / استرداد'; }
    else if (v.voucher_type === 'receipt' || payByV[e.voucher_id]) { type = 'Receipt voucher'; type_ar = 'سند قبض'; }
    else if (v.voucher_type === 'payment') { type = 'Payment voucher'; type_ar = 'سند صرف'; }
    else { type = d > 0 ? 'Debit adjustment' : 'Credit adjustment'; type_ar = d > 0 ? 'قيد مدين' : 'قيد دائن'; }
    td = r3(td + d); tc = r3(tc + c);
    rows.push({
      date: e.date, type, type_ar, voucher_no: v.voucher_no || '', bill_no: bill,
      center: e.branch?.code || '', center_name: e.branch?.name_en || '',
      details: e.description || v.description || '', notes: '', debit: d, credit: c, balance: bal,
    });
  }
  if (from && opening !== 0) {
    rows.unshift({ date: from, type: 'Opening balance', type_ar: 'رصيد افتتاحي', voucher_no: '', bill_no: '', center: '', center_name: '', details: '', notes: '', debit: opening > 0 ? opening : 0, credit: opening < 0 ? -opening : 0, balance: opening, opening: true });
    if (opening > 0) td = r3(td + opening); else tc = r3(tc - opening);
  }
  res.json({ ...empty, rows, totals: { debit: td, credit: tc, balance: bal } });
};
