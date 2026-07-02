const { Op } = require('sequelize');
const { LedgerEntry, Account, Company } = require('../models');
const { generateProfitAndLossPdf, generateBalanceSheetPdf } = require('../services/pdfService');

async function getEntries(companyId, { from, to, as_of }) {
  const where = { company_id: companyId };
  if (as_of) where.date = { [Op.lte]: as_of };
  else if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  return LedgerEntry.findAll({ where, include: [{ model: Account, as: 'account' }] });
}

function summarizeByAccount(entries, types) {
  const byAccount = {};
  entries.forEach((e) => {
    if (!e.account || !types.includes(e.account.type)) return;
    const id = e.account.id;
    if (!byAccount[id]) byAccount[id] = { account: e.account, debit: 0, credit: 0 };
    byAccount[id].debit += Number(e.debit);
    byAccount[id].credit += Number(e.credit);
  });
  return Object.values(byAccount).map((r) => ({
    account_id: r.account.id,
    code: r.account.code,
    name_en: r.account.name_en,
    name_ar: r.account.name_ar,
    // For revenue/liability/equity, normal balance is credit -> flip sign for a natural positive display
    amount: r.account.normal_balance === 'credit' ? r.debit === 0 && r.credit === 0 ? 0 : (r.credit - r.debit) : (r.debit - r.credit),
  }));
}

// Profit & Loss for a date range: revenue - expense
exports.profitAndLoss = async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ message: 'from and to dates are required' });

  const entries = await getEntries(req.companyId, { from, to });
  const revenue = summarizeByAccount(entries, ['revenue']);
  const expense = summarizeByAccount(entries, ['expense']);

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expense.reduce((s, r) => s + r.amount, 0);

  res.json({
    period: { from, to },
    revenue,
    expense,
    total_revenue: totalRevenue,
    total_expense: totalExpense,
    net_profit: totalRevenue - totalExpense,
  });
};

// Balance Sheet as of a date: assets = liabilities + equity (+ retained earnings from P&L)
exports.balanceSheet = async (req, res) => {
  const { as_of } = req.query;
  if (!as_of) return res.status(400).json({ message: 'as_of date is required' });

  const entries = await getEntries(req.companyId, { as_of });
  const assets = summarizeByAccount(entries, ['asset']);
  const liabilities = summarizeByAccount(entries, ['liability']);
  const equity = summarizeByAccount(entries, ['equity']);

  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquityBase = equity.reduce((s, r) => s + r.amount, 0);

  // Retained earnings to date = cumulative revenue - expense up to as_of
  const revenue = summarizeByAccount(entries, ['revenue']).reduce((s, r) => s + r.amount, 0);
  const expense = summarizeByAccount(entries, ['expense']).reduce((s, r) => s + r.amount, 0);
  const retainedEarnings = revenue - expense;

  res.json({
    as_of,
    assets,
    liabilities,
    equity,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity: totalEquityBase + retainedEarnings,
    retained_earnings: retainedEarnings,
    is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquityBase + retainedEarnings)) < 0.01,
  });
};

exports.profitAndLossPdf = async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ message: 'from and to dates are required' });

  const entries = await getEntries(req.companyId, { from, to });
  const revenue = summarizeByAccount(entries, ['revenue']);
  const expense = summarizeByAccount(entries, ['expense']);
  const total_revenue = revenue.reduce((s, r) => s + r.amount, 0);
  const total_expense = expense.reduce((s, r) => s + r.amount, 0);

  const company = await Company.findByPk(req.companyId);
  generateProfitAndLossPdf(res, {
    period: { from, to }, revenue, expense, total_revenue, total_expense, net_profit: total_revenue - total_expense,
  }, company);
};

exports.balanceSheetPdf = async (req, res) => {
  const { as_of } = req.query;
  if (!as_of) return res.status(400).json({ message: 'as_of date is required' });

  const entries = await getEntries(req.companyId, { as_of });
  const assets = summarizeByAccount(entries, ['asset']);
  const liabilities = summarizeByAccount(entries, ['liability']);
  const equity = summarizeByAccount(entries, ['equity']);
  const total_assets = assets.reduce((s, r) => s + r.amount, 0);
  const total_liabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquityBase = equity.reduce((s, r) => s + r.amount, 0);
  const revenue = summarizeByAccount(entries, ['revenue']).reduce((s, r) => s + r.amount, 0);
  const expense = summarizeByAccount(entries, ['expense']).reduce((s, r) => s + r.amount, 0);
  const retained_earnings = revenue - expense;

  const company = await Company.findByPk(req.companyId);
  generateBalanceSheetPdf(res, {
    as_of, assets, liabilities, equity, total_assets, total_liabilities,
    total_equity: totalEquityBase + retained_earnings, retained_earnings,
    is_balanced: Math.abs(total_assets - (total_liabilities + totalEquityBase + retained_earnings)) < 0.01,
  }, company);
};
