const {
  sequelize, Item, Account, InventoryTransaction, ItemBranchStock, Branch, Company, ItemVariant, ItemVariantBranchStock,
} = require('../models');
const itemService = require('../services/itemService');
const { generateItemsPdf, generateItemVariantsPdf } = require('../services/pdfService');
const { exportItems, exportItemVariants } = require('../services/excelService');

const accountInclude = [
  { model: Account, as: 'inventoryAccount' },
  { model: Account, as: 'incomeAccount' },
  { model: Account, as: 'cogsAccount' },
];

// Merges each item's per-branch stock AND per-variant stock (pool + branch)
// into a single company-wide total, so the Items list keeps showing one
// meaningful "stock on hand" number no matter how many branches/variants a
// company is actively using. Companies/items that never touch branches or
// variants simply never have any of those rows, so every extra field is 0 and
// total_quantity_on_hand always equals quantity_on_hand — no behavior change.
async function withBranchTotals(companyId, items) {
  const branchAgg = await ItemBranchStock.findAll({
    attributes: [
      'item_id',
      [sequelize.fn('SUM', sequelize.col('quantity_on_hand')), 'branch_qty'],
      [sequelize.fn('SUM', sequelize.literal('quantity_on_hand * cost_price')), 'branch_value'],
    ],
    where: { company_id: companyId },
    group: ['item_id'],
    raw: true,
  });
  const byItemBranch = new Map(branchAgg.map((r) => [r.item_id, r]));

  const variantAgg = await ItemVariant.findAll({
    attributes: [
      'item_id',
      [sequelize.fn('COUNT', sequelize.col('id')), 'variant_count'],
      [sequelize.fn('SUM', sequelize.col('quantity_on_hand')), 'variant_qty'],
      [sequelize.fn('SUM', sequelize.literal('quantity_on_hand * cost_price')), 'variant_value'],
    ],
    where: { company_id: companyId },
    group: ['item_id'],
    raw: true,
  });
  const byItemVariant = new Map(variantAgg.map((r) => [r.item_id, r]));

  const variantBranchAgg = await ItemVariantBranchStock.findAll({
    attributes: [
      [sequelize.col('variant.item_id'), 'item_id'],
      [sequelize.fn('SUM', sequelize.col('ItemVariantBranchStock.quantity_on_hand')), 'variant_branch_qty'],
      [sequelize.fn('SUM', sequelize.literal('"ItemVariantBranchStock"."quantity_on_hand" * "ItemVariantBranchStock"."cost_price"')), 'variant_branch_value'],
    ],
    where: { company_id: companyId },
    include: [{ model: ItemVariant, as: 'variant', attributes: [] }],
    group: ['variant.item_id'],
    raw: true,
  });
  const byItemVariantBranch = new Map(variantBranchAgg.map((r) => [r.item_id, r]));

  return items.map((it) => {
    const json = it.toJSON ? it.toJSON() : it;
    const branchRow = byItemBranch.get(json.id);
    const variantRow = byItemVariant.get(json.id);
    const variantBranchRow = byItemVariantBranch.get(json.id);

    const branchQty = branchRow ? Number(branchRow.branch_qty) : 0;
    const branchValue = branchRow ? Number(branchRow.branch_value) : 0;
    const variantQty = variantRow ? Number(variantRow.variant_qty) : 0;
    const variantValue = variantRow ? Number(variantRow.variant_value) : 0;
    const variantBranchQty = variantBranchRow ? Number(variantBranchRow.variant_branch_qty) : 0;
    const variantBranchValue = variantBranchRow ? Number(variantBranchRow.variant_branch_value) : 0;

    return {
      ...json,
      branch_quantity_on_hand: branchQty,
      variant_count: variantRow ? Number(variantRow.variant_count) : 0,
      variant_quantity_on_hand: variantQty + variantBranchQty,
      total_quantity_on_hand: Number(json.quantity_on_hand) + branchQty + variantQty + variantBranchQty,
      total_value: Number(json.quantity_on_hand) * Number(json.cost_price) + branchValue + variantValue + variantBranchValue,
    };
  });
}

exports.list = async (req, res) => {
  const { q, status } = req.query;
  const where = { company_id: req.companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;

  const items = await Item.findAll({ where, include: accountInclude, order: [['createdAt', 'DESC']] });
  const withTotals = await withBranchTotals(req.companyId, items);
  if (q) {
    const needle = q.toLowerCase();
    return res.json(withTotals.filter((i) => [i.name_en, i.name_ar, i.code, i.sku, i.category]
      .some((f) => String(f || '').toLowerCase().includes(needle))));
  }
  res.json(withTotals);
};

exports.get = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: accountInclude });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const [withTotals] = await withBranchTotals(req.companyId, [item]);
  res.json(withTotals);
};

exports.create = async (req, res) => {
  const item = await itemService.createItem(req.companyId, req.user.id, req.body);
  const withAccounts = await Item.findByPk(item.id, { include: accountInclude });
  res.status(201).json(withAccounts);
};

exports.update = async (req, res) => {
  const item = await itemService.updateItem(req.companyId, req.params.id, req.body);
  const withAccounts = await Item.findByPk(item.id, { include: accountInclude });
  res.json(withAccounts);
};

exports.remove = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  await item.update({ is_active: false });
  res.json({ message: 'Deactivated' });
};

// Manual stock correction (count adjustment, damage write-off, etc.) — logged
// through the same InventoryTransaction audit trail as every other movement.
// Accepts an optional branch_id/variant_id to scope the adjustment.
exports.adjustStock = async (req, res) => {
  const item = await itemService.adjustStock(req.companyId, req.params.id, req.user.id, {
    ...req.body,
    branchId: req.body.branch_id || null,
    variantId: req.body.variant_id || null,
  });
  const withAccounts = await Item.findByPk(item.id, { include: accountInclude });
  res.json(withAccounts);
};

// Full per-location breakdown for one item: its unbranched-pool balance, every
// branch it currently has stock at, and (if it has any) each variant's own
// same breakdown.
exports.stockByBranch = async (req, res) => {
  const breakdown = await itemService.getStockBreakdown(req.companyId, req.params.id);
  res.json(breakdown);
};

exports.transactions = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const rows = await InventoryTransaction.findAll({
    where: { item_id: item.id, company_id: req.companyId },
    include: [{ model: Branch, as: 'branch' }, { model: ItemVariant, as: 'variant' }],
    order: [['createdAt', 'DESC']],
  });
  res.json(rows);
};

exports.pdf = async (req, res) => {
  const rows = await Item.findAll({ where: { company_id: req.companyId, is_active: true }, include: accountInclude, order: [['code', 'ASC']] });
  const withTotals = await withBranchTotals(req.companyId, rows);
  const company = await Company.findByPk(req.companyId);
  generateItemsPdf(res, withTotals, company);
};

exports.exportExcel = async (req, res) => {
  const rows = await Item.findAll({ where: { company_id: req.companyId, is_active: true }, include: accountInclude, order: [['code', 'ASC']] });
  const withTotals = await withBranchTotals(req.companyId, rows);
  const company = await Company.findByPk(req.companyId);
  await exportItems(res, company, withTotals);
};

// ---- Item Variants (Color/Size/etc. combinations, each its own SKU + stock) ----

exports.listVariants = async (req, res) => {
  const rows = await ItemVariant.findAll({
    where: { item_id: req.params.id, company_id: req.companyId },
    order: [['createdAt', 'ASC']],
  });
  res.json(rows);
};

exports.createVariant = async (req, res) => {
  const variant = await itemService.createVariant(req.companyId, req.params.id, req.body);
  res.status(201).json(variant);
};

exports.updateVariant = async (req, res) => {
  const variant = await itemService.updateVariant(req.companyId, req.params.id, req.params.variantId, req.body);
  res.json(variant);
};

exports.removeVariant = async (req, res) => {
  await itemService.deactivateVariant(req.companyId, req.params.id, req.params.variantId);
  res.json({ message: 'Variant deactivated' });
};

exports.variantsPdf = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const rows = await ItemVariant.findAll({ where: { item_id: item.id, company_id: req.companyId }, order: [['createdAt', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  generateItemVariantsPdf(res, item, rows, company);
};

exports.variantsExcel = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const rows = await ItemVariant.findAll({ where: { item_id: item.id, company_id: req.companyId }, order: [['createdAt', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  await exportItemVariants(res, company, item, rows);
};
