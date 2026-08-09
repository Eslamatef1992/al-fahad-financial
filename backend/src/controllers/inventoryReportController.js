const { Op } = require('sequelize');
const { Item, ItemVariant, InventoryTransaction, Branch, Company } = require('../models');
const itemService = require('../services/itemService');
const {
  generateStockValuationPdf, generateLowStockPdf, generateStockMovementPdf,
} = require('../services/pdfService');
const {
  exportStockValuation, exportLowStock, exportStockMovement,
} = require('../services/excelService');

// One row per plain item, plus one row per variant (for items that have
// any) — the shared shape behind the valuation and low-stock reports. Scope
// is driven entirely by branch_id:
//   omitted        -> company-wide total (unbranched pool + every branch)
//   'pool'         -> only the unbranched pool balance
//   a branch's id  -> only that branch's balance
// Reuses itemService.getStockBreakdown (the same function backing the Items
// page's per-item stock view) so there is exactly one source of truth for
// "how much of this item/variant is where."
async function buildValuationRows(companyId, branchId) {
  const items = await Item.findAll({ where: { company_id: companyId, is_active: true }, order: [['code', 'ASC']] });
  const rows = [];

  for (const item of items) {
    const breakdown = await itemService.getStockBreakdown(companyId, item.id);

    if (breakdown.variants.length) {
      for (const v of breakdown.variants) {
        let quantity_on_hand, cost_price;
        if (branchId === 'pool') {
          ({ quantity_on_hand, cost_price } = v.unbranched);
        } else if (branchId) {
          const b = v.branches.find((x) => x.branch_id === branchId);
          quantity_on_hand = b ? b.quantity_on_hand : 0;
          cost_price = b ? b.cost_price : 0;
        } else {
          quantity_on_hand = v.total_quantity_on_hand;
          cost_price = quantity_on_hand > 0.0000001 ? v.total_value / quantity_on_hand : 0;
        }
        rows.push({
          item_id: item.id, code: item.code, sku: item.sku, name_en: item.name_en, name_ar: item.name_ar, unit: item.unit,
          variant_id: v.variant_id, variant_sku: v.sku, attributes: v.attributes,
          quantity_on_hand, cost_price, value: quantity_on_hand * cost_price,
          reorder_level: Number((await ItemVariant.findByPk(v.variant_id))?.reorder_level ?? item.reorder_level ?? 0),
        });
      }
    } else {
      let quantity_on_hand, cost_price;
      if (branchId === 'pool') {
        ({ quantity_on_hand, cost_price } = breakdown.unbranched);
      } else if (branchId) {
        const b = breakdown.branches.find((x) => x.branch_id === branchId);
        quantity_on_hand = b ? b.quantity_on_hand : 0;
        cost_price = b ? b.cost_price : 0;
      } else {
        quantity_on_hand = breakdown.total_quantity_on_hand;
        cost_price = quantity_on_hand > 0.0000001 ? breakdown.total_value / quantity_on_hand : 0;
      }
      rows.push({
        item_id: item.id, code: item.code, sku: item.sku, name_en: item.name_en, name_ar: item.name_ar, unit: item.unit,
        variant_id: null, quantity_on_hand, cost_price, value: quantity_on_hand * cost_price,
        reorder_level: Number(item.reorder_level || 0),
      });
    }
  }
  return rows;
}

function locationLabelFrom(branchLabel, branchId) {
  if (branchId === 'pool') return 'Unbranched pool only';
  if (branchId) return `Branch: ${branchLabel}`;
  return 'All locations (pool + branches)';
}

async function resolveBranchLabel(companyId, branchId) {
  if (!branchId || branchId === 'pool') return null;
  const branch = await Branch.findOne({ where: { id: branchId, company_id: companyId } });
  return branch ? `${branch.code} - ${branch.name_en}` : branchId;
}

// ---- Stock Valuation ----

exports.valuation = async (req, res) => {
  const { branch_id } = req.query;
  const rows = await buildValuationRows(req.companyId, branch_id || null);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  res.json({ branch_id: branch_id || null, rows, total_value: totalValue });
};

exports.valuationPdf = async (req, res) => {
  const { branch_id } = req.query;
  const rows = await buildValuationRows(req.companyId, branch_id || null);
  const branchLabel = await resolveBranchLabel(req.companyId, branch_id);
  const company = await Company.findByPk(req.companyId);
  generateStockValuationPdf(res, rows, company, locationLabelFrom(branchLabel, branch_id));
};

exports.valuationExcel = async (req, res) => {
  const { branch_id } = req.query;
  const rows = await buildValuationRows(req.companyId, branch_id || null);
  const branchLabel = await resolveBranchLabel(req.companyId, branch_id);
  const company = await Company.findByPk(req.companyId);
  await exportStockValuation(res, company, rows, locationLabelFrom(branchLabel, branch_id));
};

// ---- Low Stock / Reorder ----

async function buildLowStockRows(companyId, branchId) {
  const rows = await buildValuationRows(companyId, branchId);
  return rows.filter((r) => r.reorder_level > 0 && r.quantity_on_hand <= r.reorder_level);
}

exports.lowStock = async (req, res) => {
  const { branch_id } = req.query;
  const rows = await buildLowStockRows(req.companyId, branch_id || null);
  res.json({ branch_id: branch_id || null, rows });
};

exports.lowStockPdf = async (req, res) => {
  const { branch_id } = req.query;
  const rows = await buildLowStockRows(req.companyId, branch_id || null);
  const branchLabel = await resolveBranchLabel(req.companyId, branch_id);
  const company = await Company.findByPk(req.companyId);
  generateLowStockPdf(res, rows, company, locationLabelFrom(branchLabel, branch_id));
};

exports.lowStockExcel = async (req, res) => {
  const { branch_id } = req.query;
  const rows = await buildLowStockRows(req.companyId, branch_id || null);
  const branchLabel = await resolveBranchLabel(req.companyId, branch_id);
  const company = await Company.findByPk(req.companyId);
  await exportLowStock(res, company, rows, locationLabelFrom(branchLabel, branch_id));
};

// ---- Stock Movement / Card (one item's full in/out history) ----

async function buildMovementRows(companyId, { itemId, variantId, branchId, from, to }) {
  const where = { company_id: companyId, item_id: itemId };
  if (variantId) where.variant_id = variantId;
  if (branchId) where.branch_id = branchId;
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  return InventoryTransaction.findAll({ where, order: [['date', 'ASC'], ['createdAt', 'ASC']] });
}

exports.movement = async (req, res) => {
  const { item_id, variant_id, branch_id, from, to } = req.query;
  if (!item_id) return res.status(400).json({ message: 'item_id is required' });
  const item = await Item.findOne({ where: { id: item_id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const rows = await buildMovementRows(req.companyId, { itemId: item_id, variantId: variant_id, branchId: branch_id, from, to });
  res.json({ item, rows });
};

exports.movementPdf = async (req, res) => {
  const { item_id, variant_id, branch_id, from, to } = req.query;
  if (!item_id) return res.status(400).json({ message: 'item_id is required' });
  const item = await Item.findOne({ where: { id: item_id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const rows = await buildMovementRows(req.companyId, { itemId: item_id, variantId: variant_id, branchId: branch_id, from, to });
  const company = await Company.findByPk(req.companyId);
  generateStockMovementPdf(res, item, rows, company);
};

exports.movementExcel = async (req, res) => {
  const { item_id, variant_id, branch_id, from, to } = req.query;
  if (!item_id) return res.status(400).json({ message: 'item_id is required' });
  const item = await Item.findOne({ where: { id: item_id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const rows = await buildMovementRows(req.companyId, { itemId: item_id, variantId: variant_id, branchId: branch_id, from, to });
  const company = await Company.findByPk(req.companyId);
  await exportStockMovement(res, company, item, rows);
};
