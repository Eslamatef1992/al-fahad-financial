const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const {
  sequelize, Item, Account, InventoryTransaction, ItemBranchStock, Branch, Company, ItemVariant, ItemVariantBranchStock, ItemCategory, Unit,
} = require('../models');
const itemService = require('../services/itemService');
const bookingService = require('../services/bookingService');
const { generateItemsPdf, generateItemVariantsPdf } = require('../services/pdfService');
const { exportItems, exportItemVariants } = require('../services/excelService');
const { toPublicPath } = require('../middleware/upload');

const accountInclude = [
  { model: Account, as: 'inventoryAccount' },
  { model: Account, as: 'incomeAccount' },
  { model: Account, as: 'cogsAccount' },
  { model: ItemCategory, as: 'itemCategory' },
  { model: Unit, as: 'itemUnit', include: [{ model: Unit, as: 'baseUnit' }] },
];

// Merges each item's per-branch stock AND per-variant stock (pool + branch)
// into a single company-wide total, so the Items list keeps showing one
// meaningful "stock on hand" number no matter how many branches/variants a
// company is actively using. Companies/items that never touch branches or
// variants simply never have any of those rows, so every extra field is 0 and
// total_quantity_on_hand always equals quantity_on_hand — no behavior change.
// branchId, when given, scopes stock/value/booked to ONLY that branch (used
// by the Items list's branch filter) instead of the company-wide total
// across the unbranched pool + every branch + every variant. Omitting it
// keeps the original company-wide behavior exactly as before.
async function withBranchTotals(companyId, items, branchId) {
  const branchWhere = { company_id: companyId, ...(branchId ? { branch_id: branchId } : {}) };
  const branchAgg = await ItemBranchStock.findAll({
    attributes: [
      'item_id',
      [sequelize.fn('SUM', sequelize.col('quantity_on_hand')), 'branch_qty'],
      [sequelize.fn('SUM', sequelize.literal('quantity_on_hand * cost_price')), 'branch_value'],
    ],
    where: branchWhere,
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
    where: branchWhere,
    include: [{ model: ItemVariant, as: 'variant', attributes: [] }],
    group: ['variant.item_id'],
    raw: true,
  });
  const byItemVariantBranch = new Map(variantBranchAgg.map((r) => [r.item_id, r]));
  const bookedByItem = await bookingService.bookedQuantitiesByItem(companyId, branchId);

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
    // When scoped to a specific branch, "on hand" means stock physically at
    // that branch only (its own item stock + its own variant stock) — the
    // unbranched pool and other branches don't count as available there.
    const totalOnHand = branchId
      ? branchQty + variantBranchQty
      : Number(json.quantity_on_hand) + branchQty + variantQty + variantBranchQty;
    const bookedQty = bookedByItem.get(json.id) || 0;

    return {
      ...json,
      booked_quantity: bookedQty,
      available_quantity: totalOnHand - bookedQty,
      // Prefer the managed category (itemCategory) over the legacy free-text
      // `category` string — old items that only ever had free text still
      // display fine, new items link to a real, reusable ItemCategory.
      category_name: json.itemCategory?.name_en || json.category || null,
      // Same pattern for units: prefer the managed Unit (with its conversion
      // info) over the legacy free-text `unit` string.
      unit_name: json.itemUnit?.name_en || json.unit || null,
      unit_conversion: json.itemUnit?.base_unit_id
        ? `1 ${json.itemUnit.name_en} = ${Number(json.itemUnit.conversion_factor)} ${json.itemUnit.baseUnit?.name_en || ''}`.trim()
        : null,
      branch_quantity_on_hand: branchQty,
      variant_count: variantRow ? Number(variantRow.variant_count) : 0,
      variant_quantity_on_hand: variantQty + variantBranchQty,
      total_quantity_on_hand: totalOnHand,
      total_value: branchId
        ? branchValue + variantBranchValue
        : Number(json.quantity_on_hand) * Number(json.cost_price) + branchValue + variantValue + variantBranchValue,
    };
  });
}

// Shared query builder used by list/pdf/excel so every export can respect
// exactly the same filters as what's on screen: status (active/inactive/all),
// category, unit, branch (see withBranchTotals above), a created-date range,
// low-stock-only, booked-only, and the free-text search box.
async function queryItems(companyId, query) {
  const {
    q, status, category_id, unit_id, branch_id, date_from, date_to, low_stock, booked_only,
  } = query;

  const where = { company_id: companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  if (category_id) where.category_id = category_id;
  if (unit_id) where.unit_id = unit_id;
  if (date_from || date_to) {
    where.createdAt = {};
    if (date_from) where.createdAt[Op.gte] = new Date(`${date_from}T00:00:00.000Z`);
    if (date_to) where.createdAt[Op.lte] = new Date(`${date_to}T23:59:59.999Z`);
  }

  const items = await Item.findAll({ where, include: accountInclude, order: [['createdAt', 'DESC']] });
  let withTotals = await withBranchTotals(companyId, items, branch_id || null);

  if (low_stock === 'true' || low_stock === true) {
    withTotals = withTotals.filter((i) => Number(i.reorder_level) > 0 && Number(i.total_quantity_on_hand) <= Number(i.reorder_level));
  }
  if (booked_only === 'true' || booked_only === true) {
    withTotals = withTotals.filter((i) => Number(i.booked_quantity) > 0);
  }
  if (q) {
    const needle = q.toLowerCase();
    withTotals = withTotals.filter((i) => [i.name_en, i.name_ar, i.code, i.sku, i.category_name, i.unit_name]
      .some((f) => String(f || '').toLowerCase().includes(needle)));
  }
  return withTotals;
}

exports.list = async (req, res) => {
  res.json(await queryItems(req.companyId, req.query));
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

// Uploads/replaces an item's optional product photo. Purely cosmetic (shown
// in the items list and on the item form) — never required, and posting/
// stock/ledger logic never reads it. Mirrors companyController.uploadLogo.
exports.uploadImage = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  if (item.image_url) {
    const oldPath = path.join(__dirname, '..', item.image_url.replace(/^\/uploads\//, 'uploads/'));
    fs.unlink(oldPath, () => {});
  }

  const image_url = toPublicPath(req.file, item.company_id, 'item-images');
  await item.update({ image_url });
  const withAccounts = await Item.findByPk(item.id, { include: accountInclude });
  res.json(withAccounts);
};

exports.removeImage = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  if (item.image_url) {
    const oldPath = path.join(__dirname, '..', item.image_url.replace(/^\/uploads\//, 'uploads/'));
    fs.unlink(oldPath, () => {});
  }
  await item.update({ image_url: null });
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
  const withTotals = (await queryItems(req.companyId, { status: 'active', ...req.query })).sort((a, b) => String(a.code).localeCompare(b.code));
  const company = await Company.findByPk(req.companyId);
  generateItemsPdf(res, withTotals, company);
};

exports.exportExcel = async (req, res) => {
  const withTotals = (await queryItems(req.companyId, { status: 'active', ...req.query })).sort((a, b) => String(a.code).localeCompare(b.code));
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
