const { Op } = require('sequelize');
const { LedgerEntry, Account, CostCenter, Voucher, Company } = require('../models');
const { exportLedger, exportTrialBalance } = require('../services/excelService');
const { generateTrialBalancePdf } = require('../services/pdfService');

// General Ledger viewer: filter by account, cost center, date range
exports.query = async (req, res) => {
  const { account_id, cost_center_id, from, to } = req.query;
  const where = { company_id: req.companyId };
  if (account_id) where.account_id = account_id;
  if (cost_center_id) where.cost_center_id = cost_center_id;
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };

  const entries = await LedgerEntry.findAll({
    where,
    include: [
      { model: Account, as: 'account' },
      { model: CostCenter, as: 'costCenter' },
      { model: Voucher, attributes: ['voucher_no', 'voucher_type', 'status'] },
    ],
    order: [['date', 'ASC'], ['createdAt', 'ASC']],
  });

  let running = 0;
  const rows = entries.map((e) => {
    running += Number(e.debit) - Number(e.credit);
    return { ...e.toJSON(), running_balance: running };
  });

  res.json(rows);
};

exports.exportExcel = async (req, res) => {
  const { account_id, cost_center_id, from, to } = req.query;
  const where = { company_id: req.companyId };
  if (account_id) where.account_id = account_id;
  if (cost_center_id) where.cost_center_id = cost_center_id;
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };

  const entries = await LedgerEntry.findAll({
    where,
    include: [{ model: Account, as: 'account' }, { model: Voucher, attributes: ['voucher_no'] }],
    order: [['date', 'ASC'], ['createdAt', 'ASC']],
  });

  let running = 0;
  const rows = entries.map((e) => {
    running += Number(e.debit) - Number(e.credit);
    return { ...e.toJSON(), running_balance: running };
  });

  const company = await Company.findByPk(req.companyId);
  await exportLedger(res, company, rows, { from, to });
};

// Trial balance: net balance per account as of a date
exports.trialBalance = async (req, res) => {
  const { as_of } = req.query;
  const where = { company_id: req.companyId };
  if (as_of) where.date = { [Op.lte]: as_of };

  const entries = await LedgerEntry.findAll({ where, include: [{ model: Account, as: 'account' }] });

  const byAccount = {};
  entries.forEach((e) => {
    const id = e.account_id;
    if (!byAccount[id]) {
      byAccount[id] = { account: e.account, debit: 0, credit: 0 };
    }
    byAccount[id].debit += Number(e.debit);
    byAccount[id].credit += Number(e.credit);
  });

  const rows = Object.values(byAccount).map((r) => ({
    account: r.account,
    debit: r.debit,
    credit: r.credit,
    balance: r.debit - r.credit,
  }));

  res.json(rows);
};

exports.trialBalanceExcel = async (req, res) => {
  const { as_of } = req.query;
  const where = { company_id: req.companyId };
  if (as_of) where.date = { [Op.lte]: as_of };

  const entries = await LedgerEntry.findAll({ where, include: [{ model: Account, as: 'account' }] });
  const byAccount = {};
  entries.forEach((e) => {
    const id = e.account_id;
    if (!byAccount[id]) byAccount[id] = { account: e.account, debit: 0, credit: 0 };
    byAccount[id].debit += Number(e.debit);
    byAccount[id].credit += Number(e.credit);
  });
  const rows = Object.values(byAccount);

  const company = await Company.findByPk(req.companyId);
  await exportTrialBalance(res, company, rows, as_of);
};

exports.trialBalancePdf = async (req, res) => {
  const { as_of } = req.query;
  const where = { company_id: req.companyId };
  if (as_of) where.date = { [Op.lte]: as_of };

  const entries = await LedgerEntry.findAll({ where, include: [{ model: Account, as: 'account' }] });
  const byAccount = {};
  entries.forEach((e) => {
    const id = e.account_id;
    if (!byAccount[id]) byAccount[id] = { account: e.account, debit: 0, credit: 0 };
    byAccount[id].debit += Number(e.debit);
    byAccount[id].credit += Number(e.credit);
  });
  const rows = Object.values(byAccount);

  const company = await Company.findByPk(req.companyId);
  generateTrialBalancePdf(res, rows, as_of, company);
};
