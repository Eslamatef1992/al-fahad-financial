const { QueryTypes } = require('sequelize');
const { sequelize, SalesTarget, SalesPerson, Branch, ItemCategory, Item } = require('../models');

const num = (v) => Number(v || 0);
const r3 = (v) => Math.round(num(v) * 1000) / 1000;

function monthRange(month) {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : new Date().toISOString().slice(0, 7);
  const start = `${m}-01`;
  const d = new Date(`${start}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1);
  return { month: m, start, end: d.toISOString().slice(0, 10) };
}

// Net in-scope sales credited to one sales person in a window: invoice line
// subtotals (sales, posted/paid) minus the value of returns made in the same window.
async function actualSales(companyId, salespersonId, { start, end }, scope = {}) {
  const f = (alias) => `${scope.branch_id ? ` AND ${alias}.branch_id = :b` : ''}`;
  const itemF = `${scope.category_id ? ' AND it.category_id = :cat' : ''}${scope.item_id ? ' AND it.id = :item' : ''}`;
  const rep = { c: companyId, sp: salespersonId, s: start, e: end, b: scope.branch_id, cat: scope.category_id, item: scope.item_id };
  const [sold] = await sequelize.query(`
    SELECT COALESCE(SUM(l.line_subtotal), 0) AS v FROM invoice_lines l
      JOIN invoices i ON i.id = l.invoice_id LEFT JOIN items it ON it.id = l.item_id
     WHERE i.company_id = :c AND i.type = 'sales' AND i.status NOT IN ('draft', 'cancelled') AND i.salesperson_id = :sp
       AND i.date >= :s AND i.date < :e ${f('i')} ${itemF}`, { replacements: rep, type: QueryTypes.SELECT });
  const [ret] = await sequelize.query(`
    SELECT COALESCE(SUM(rl.line_subtotal), 0) AS v FROM sales_return_lines rl
      JOIN sales_returns r ON r.id = rl.return_id JOIN invoices i ON i.id = r.invoice_id LEFT JOIN items it ON it.id = rl.item_id
     WHERE i.company_id = :c AND i.salesperson_id = :sp AND r.date >= :s AND r.date < :e ${f('i')} ${itemF}`, { replacements: rep, type: QueryTypes.SELECT });
  return { sold: r3(sold.v), returned: r3(ret.v), net: r3(num(sold.v) - num(ret.v)) };
}

exports.list = async (req, res) => {
  const range = monthRange(req.query.month);
  const targets = await SalesTarget.findAll({ where: { company_id: req.companyId, month: range.start }, order: [['created_at', 'ASC']] });
  const people = await SalesPerson.findAll({ where: { company_id: req.companyId } });
  const out = [];
  for (const t of targets) {
    const a = await actualSales(req.companyId, t.salesperson_id, range, { branch_id: t.branch_id, category_id: t.category_id, item_id: t.item_id });
    const target = num(t.target_amount);
    const pct = target > 0 ? (a.net / target) * 100 : 0;
    const reached = a.net >= target - 0.0005;
    const commission = (t.commission_mode === 'always' || reached) ? r3((a.net * num(t.commission_pct)) / 100) : 0;
    out.push({ ...t.toJSON(), salesperson: people.find((p) => p.id === t.salesperson_id) || null, actual: a, achieved_pct: r3(pct), reached, commission });
  }
  res.json({ month: range.month, targets: out });
};

// Every sales person's net sales for the month, targeted or not.
exports.performance = async (req, res) => {
  const range = monthRange(req.query.month);
  const people = await SalesPerson.findAll({ where: { company_id: req.companyId }, order: [['name_en', 'ASC']] });
  const out = [];
  for (const p of people) out.push({ salesperson: p, ...(await actualSales(req.companyId, p.id, range)) });
  res.json({ month: range.month, rows: out });
};

async function clean(req, body) {
  const out = {};
  const sp = await SalesPerson.findOne({ where: { id: body.salesperson_id, company_id: req.companyId } });
  if (!sp) return { error: 'Choose a sales person' };
  out.salesperson_id = sp.id;
  const mm = /^\d{4}-\d{2}/.test(body.month || '') ? `${body.month.slice(0, 7)}-01` : null;
  if (!mm) return { error: 'Choose a month' };
  out.month = mm;
  const amt = Number(body.target_amount);
  if (!(amt > 0)) return { error: 'Target amount must be greater than zero' };
  out.target_amount = amt;
  if (body.branch_id) { if (!(await Branch.findOne({ where: { id: body.branch_id, company_id: req.companyId } }))) return { error: 'Unknown branch' }; }
  if (body.category_id) { if (!(await ItemCategory.findOne({ where: { id: body.category_id, company_id: req.companyId } }))) return { error: 'Unknown category' }; }
  if (body.item_id) { if (!(await Item.findOne({ where: { id: body.item_id, company_id: req.companyId } }))) return { error: 'Unknown item' }; }
  out.branch_id = body.branch_id || null; out.category_id = body.category_id || null; out.item_id = body.item_id || null;
  const pct = Number(body.commission_pct || 0);
  if (!(pct >= 0 && pct <= 100)) return { error: 'Commission % must be between 0 and 100' };
  out.commission_pct = pct;
  out.commission_mode = body.commission_mode === 'always' ? 'always' : 'on_achievement';
  out.notes = body.notes || null;
  return { out };
}

exports.create = async (req, res) => {
  const { out, error } = await clean(req, req.body);
  if (error) return res.status(400).json({ message: error });
  res.status(201).json(await SalesTarget.create({ ...out, company_id: req.companyId }));
};
exports.update = async (req, res) => {
  const row = await SalesTarget.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!row) return res.status(404).json({ message: 'Target not found' });
  const { out, error } = await clean(req, { ...row.toJSON(), month: row.month, ...req.body });
  if (error) return res.status(400).json({ message: error });
  await row.update(out);
  res.json(row);
};
exports.remove = async (req, res) => {
  await SalesTarget.destroy({ where: { id: req.params.id, company_id: req.companyId } });
  res.json({ ok: true });
};
