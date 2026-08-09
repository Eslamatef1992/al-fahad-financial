const { Op } = require('sequelize');
const { StockTransfer, StockTransferLine, Item, ItemVariant, Branch, Company } = require('../models');
const itemService = require('../services/itemService');
const { generateStockTransfersPdf } = require('../services/pdfService');
const { exportStockTransfers } = require('../services/excelService');

const fullInclude = [
  { model: Branch, as: 'fromBranch' },
  { model: Branch, as: 'toBranch' },
  {
    model: StockTransferLine,
    as: 'lines',
    include: [{ model: Item, as: 'item' }, { model: ItemVariant, as: 'variant' }],
  },
];

function buildWhere(req) {
  const { branch_id, item_id, from, to } = req.query;
  const where = { company_id: req.companyId };
  if (branch_id) where[Op.or] = [{ from_branch_id: branch_id }, { to_branch_id: branch_id }];
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  return { where, item_id: item_id || null };
}

// item_id can't be filtered directly on the header (it now lives on the
// lines), so when given we filter the header list down to only transfers
// that have at least one matching line, after loading.
function filterByItem(rows, itemId) {
  if (!itemId) return rows;
  return rows.filter((r) => (r.lines || []).some((l) => l.item_id === itemId));
}

exports.list = async (req, res) => {
  const { where, item_id } = buildWhere(req);
  const rows = await StockTransfer.findAll({ where, include: fullInclude, order: [['date', 'DESC'], ['createdAt', 'DESC']] });
  res.json(filterByItem(rows, item_id));
};

exports.get = async (req, res) => {
  const row = await StockTransfer.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: fullInclude });
  if (!row) return res.status(404).json({ message: 'Stock transfer not found' });
  res.json(row);
};

// Creates and immediately executes a transfer — unlike Invoices/POs there is
// no draft state here: a transfer is a single atomic stock movement, so
// "create" and "post" are the same action. Supports multiple items (and
// variants) per transfer via `lines`.
exports.create = async (req, res) => {
  const { from_branch_id, to_branch_id, date, notes, lines } = req.body;
  const transfer = await itemService.transferStock(req.companyId, req.user.id, {
    fromBranchId: from_branch_id || null,
    toBranchId: to_branch_id || null,
    date,
    notes,
    lines: (lines || []).map((l) => ({ item_id: l.item_id, variant_id: l.variant_id || null, quantity: l.quantity })),
  });
  const withDetails = await StockTransfer.findByPk(transfer.id, { include: fullInclude });
  res.status(201).json(withDetails);
};

exports.pdf = async (req, res) => {
  const { where, item_id } = buildWhere(req);
  const rows = filterByItem(
    await StockTransfer.findAll({ where, include: fullInclude, order: [['date', 'DESC']] }),
    item_id,
  );
  const company = await Company.findByPk(req.companyId);
  generateStockTransfersPdf(res, rows, company);
};

exports.exportExcel = async (req, res) => {
  const { where, item_id } = buildWhere(req);
  const rows = filterByItem(
    await StockTransfer.findAll({ where, include: fullInclude, order: [['date', 'DESC']] }),
    item_id,
  );
  const company = await Company.findByPk(req.companyId);
  await exportStockTransfers(res, company, rows);
};
