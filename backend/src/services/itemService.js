const {
  sequelize, Item, InventoryTransaction, Account, ItemBranchStock, StockTransfer, StockTransferLine, Branch,
  ItemVariant, ItemVariantBranchStock,
} = require('../models');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Item not found'); e.status = 404; return e; }

async function nextTransferNo(companyId) {
  const count = await StockTransfer.count({ where: { company_id: companyId } });
  return `ST-${String(count + 1).padStart(6, '0')}`;
}

async function nextItemCode(companyId) {
  const count = await Item.count({ where: { company_id: companyId } });
  return `ITM-${String(count + 1).padStart(5, '0')}`;
}

async function validateAccount(companyId, accountId, expectedType, label, t) {
  const account = await Account.findOne({ where: { id: accountId, company_id: companyId }, transaction: t });
  if (!account) throw badRequest(`${label}: account not found`);
  if (account.is_group) throw badRequest(`${label}: cannot post to a group account (${account.code})`);
  if (account.type !== expectedType) throw badRequest(`${label} must be a ${expectedType} account (got "${account.code}" which is ${account.type})`);
  return account;
}

async function validateBranch(companyId, branchId, t) {
  const branch = await Branch.findOne({ where: { id: branchId, company_id: companyId }, transaction: t });
  if (!branch) throw badRequest('Invalid branch');
  return branch;
}

// Confirms a variant both exists and actually belongs to the given item (and
// company) — same cross-tenant/cross-item safety net as validateBranch, since
// a stray variant_id in a request body must never let one item's line move
// another item's (or another company's) stock.
async function validateVariant(companyId, itemId, variantId, t) {
  const variant = await ItemVariant.findOne({ where: { id: variantId, item_id: itemId, company_id: companyId }, transaction: t });
  if (!variant) throw badRequest('Invalid variant for this item');
  return variant;
}

// Locks (and lazily creates, if missing) the running stock-balance row for a
// given (item, branch) pair. A branch's stock only starts existing the first
// time something moves through it — before that, it's simply zero.
async function getOrCreateBranchStock(companyId, itemId, branchId, t) {
  let row = await ItemBranchStock.findOne({
    where: { item_id: itemId, branch_id: branchId, company_id: companyId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!row) {
    row = await ItemBranchStock.create({
      company_id: companyId, item_id: itemId, branch_id: branchId, quantity_on_hand: 0, cost_price: 0,
    }, { transaction: t });
  }
  return row;
}

// Same idea, one level down: the running balance for a (variant, branch) pair.
async function getOrCreateVariantBranchStock(companyId, variantId, branchId, t) {
  let row = await ItemVariantBranchStock.findOne({
    where: { variant_id: variantId, branch_id: branchId, company_id: companyId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!row) {
    row = await ItemVariantBranchStock.create({
      company_id: companyId, variant_id: variantId, branch_id: branchId, quantity_on_hand: 0, cost_price: 0,
    }, { transaction: t });
  }
  return row;
}

// Resolves which single row actually holds the running balance for a given
// (item, branch?, variant?) combination — the one shared piece of logic
// behind receiveStock/issueStock/transferStock/adjustStock. Four cases:
//   no variant, no branch  -> the Item row itself (company-wide pool)
//   no variant, a branch   -> ItemBranchStock(item, branch)
//   a variant, no branch   -> the ItemVariant row itself (variant's own pool)
//   a variant, a branch    -> ItemVariantBranchStock(variant, branch)
// Companies/items that never touch branches or variants always land on the
// first case, so nothing changes for them.
async function resolveTarget(companyId, itemId, { branchId, variantId }, t) {
  const item = branchId || variantId
    ? await Item.findOne({ where: { id: itemId, company_id: companyId }, transaction: t })
    : await Item.findOne({ where: { id: itemId, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!item) throw notFound();

  let variant = null;
  if (variantId) {
    variant = branchId
      ? await validateVariant(companyId, itemId, variantId, t)
      : await ItemVariant.findOne({ where: { id: variantId, item_id: itemId, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!variant) throw badRequest('Invalid variant for this item');
  }

  let target;
  if (variant && branchId) target = await getOrCreateVariantBranchStock(companyId, variant.id, branchId, t);
  else if (variant) target = variant;
  else if (branchId) target = await getOrCreateBranchStock(companyId, itemId, branchId, t);
  else target = item;

  const label = item.name_en + (variant ? ` (${variant.sku})` : '');
  return { item, variant, target, label };
}

// Creates a new inventory item. If opening_quantity/opening_cost are given,
// seeds the initial stock balance and logs a matching 'opening' movement so
// the balance is traceable from day one, exactly like any other stock change.
async function createItem(companyId, userId, payload) {
  const {
    name_en, name_ar, category, unit, sku, variant_attributes, inventory_account_id, income_account_id, cogs_account_id,
    selling_price, reorder_level, opening_quantity, opening_cost,
  } = payload;

  if (!name_en || !name_ar) throw badRequest('name_en and name_ar are required');
  if (!inventory_account_id || !income_account_id || !cogs_account_id) {
    throw badRequest('inventory_account_id, income_account_id, and cogs_account_id are all required');
  }

  return sequelize.transaction(async (t) => {
    await validateAccount(companyId, inventory_account_id, 'asset', 'Inventory account', t);
    await validateAccount(companyId, income_account_id, 'revenue', 'Income account', t);
    await validateAccount(companyId, cogs_account_id, 'expense', 'COGS account', t);

    const code = await nextItemCode(companyId);
    const qty = Number(opening_quantity || 0);
    const cost = Number(opening_cost || 0);

    const item = await Item.create({
      company_id: companyId,
      code,
      sku: sku || null,
      name_en,
      name_ar,
      category: category || null,
      unit: unit || 'pcs',
      variant_attributes: Array.isArray(variant_attributes) ? variant_attributes : [],
      inventory_account_id,
      income_account_id,
      cogs_account_id,
      selling_price: Number(selling_price || 0),
      reorder_level: Number(reorder_level || 0),
      cost_price: cost,
      quantity_on_hand: qty,
    }, { transaction: t });

    if (qty > 0) {
      await InventoryTransaction.create({
        company_id: companyId,
        item_id: item.id,
        type: 'opening',
        reference_type: 'manual',
        date: new Date().toISOString().slice(0, 10),
        quantity: qty,
        unit_cost: cost,
        balance_qty_after: qty,
        balance_value_after: qty * cost,
        notes: 'Opening balance',
        created_by: userId,
      }, { transaction: t });
    }

    return item;
  });
}

// Editable fields only — quantity_on_hand and cost_price are system-maintained
// and can only change via receiveStock/issueStock/adjustStock below.
async function updateItem(companyId, itemId, payload) {
  const { name_en, name_ar, category, unit, sku, variant_attributes, inventory_account_id, income_account_id, cogs_account_id, selling_price, reorder_level, is_active } = payload;

  return sequelize.transaction(async (t) => {
    const item = await Item.findOne({ where: { id: itemId, company_id: companyId }, transaction: t });
    if (!item) throw notFound();

    if (inventory_account_id && inventory_account_id !== item.inventory_account_id) {
      await validateAccount(companyId, inventory_account_id, 'asset', 'Inventory account', t);
    }
    if (income_account_id && income_account_id !== item.income_account_id) {
      await validateAccount(companyId, income_account_id, 'revenue', 'Income account', t);
    }
    if (cogs_account_id && cogs_account_id !== item.cogs_account_id) {
      await validateAccount(companyId, cogs_account_id, 'expense', 'COGS account', t);
    }

    await item.update({
      name_en: name_en ?? item.name_en,
      name_ar: name_ar ?? item.name_ar,
      category: category ?? item.category,
      unit: unit ?? item.unit,
      sku: sku !== undefined ? (sku || null) : item.sku,
      variant_attributes: Array.isArray(variant_attributes) ? variant_attributes : item.variant_attributes,
      inventory_account_id: inventory_account_id || item.inventory_account_id,
      income_account_id: income_account_id || item.income_account_id,
      cogs_account_id: cogs_account_id || item.cogs_account_id,
      selling_price: selling_price !== undefined ? Number(selling_price) : item.selling_price,
      reorder_level: reorder_level !== undefined ? Number(reorder_level) : item.reorder_level,
      is_active: is_active !== undefined ? is_active : item.is_active,
    }, { transaction: t });

    return item;
  });
}

// ---- Item Variants (Color/Size/etc. combinations with their own SKU) ----

async function createVariant(companyId, itemId, payload) {
  const { sku, attributes, selling_price, reorder_level, opening_quantity, opening_cost } = payload;
  if (!sku) throw badRequest('sku is required for a variant');

  return sequelize.transaction(async (t) => {
    const item = await Item.findOne({ where: { id: itemId, company_id: companyId }, transaction: t });
    if (!item) throw notFound();

    const qty = Number(opening_quantity || 0);
    const cost = Number(opening_cost || 0);

    const variant = await ItemVariant.create({
      company_id: companyId,
      item_id: itemId,
      sku,
      attributes: attributes && typeof attributes === 'object' ? attributes : {},
      quantity_on_hand: qty,
      cost_price: cost,
      selling_price: selling_price !== undefined && selling_price !== null ? Number(selling_price) : null,
      reorder_level: reorder_level !== undefined && reorder_level !== null ? Number(reorder_level) : null,
    }, { transaction: t });

    if (qty > 0) {
      await InventoryTransaction.create({
        company_id: companyId,
        item_id: itemId,
        variant_id: variant.id,
        type: 'opening',
        reference_type: 'manual',
        date: new Date().toISOString().slice(0, 10),
        quantity: qty,
        unit_cost: cost,
        balance_qty_after: qty,
        balance_value_after: qty * cost,
        notes: 'Opening balance',
      }, { transaction: t });
    }

    return variant;
  });
}

async function updateVariant(companyId, itemId, variantId, payload) {
  const { sku, attributes, selling_price, reorder_level, is_active } = payload;
  const variant = await ItemVariant.findOne({ where: { id: variantId, item_id: itemId, company_id: companyId } });
  if (!variant) throw notFound('Variant not found');

  await variant.update({
    sku: sku ?? variant.sku,
    attributes: attributes && typeof attributes === 'object' ? attributes : variant.attributes,
    selling_price: selling_price !== undefined ? (selling_price === null ? null : Number(selling_price)) : variant.selling_price,
    reorder_level: reorder_level !== undefined ? (reorder_level === null ? null : Number(reorder_level)) : variant.reorder_level,
    is_active: is_active !== undefined ? is_active : variant.is_active,
  });
  return variant;
}

async function deactivateVariant(companyId, itemId, variantId) {
  const variant = await ItemVariant.findOne({ where: { id: variantId, item_id: itemId, company_id: companyId } });
  if (!variant) throw notFound('Variant not found');
  await variant.update({ is_active: false });
  return variant;
}

// Receives stock (e.g. a posted Purchase Bill line) and recomputes the
// running weighted-average cost:
//   new_avg_cost = (old_qty * old_avg_cost + received_qty * received_unit_cost) / (old_qty + received_qty)
// Runs inside the caller's transaction so it stays atomic with whatever
// posted the ledger entries that triggered this receipt.
//
// branchId scopes this to one branch's own balance instead of the item's
// company-wide pool; variantId scopes it to one specific variant's balance
// instead of the plain item's. Either, both, or neither may be given — see
// resolveTarget above for the four combinations. Companies/items that never
// use branches or variants see zero behavior change.
async function receiveStock(companyId, itemId, { quantity, unitCost, date, referenceType, referenceId, userId, notes, type, branchId, variantId }, t) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw badRequest('receiveStock quantity must be greater than zero');

  const { item, target, label } = await resolveTarget(companyId, itemId, { branchId, variantId }, t);

  const oldQty = Number(target.quantity_on_hand);
  const oldCost = Number(target.cost_price);
  const newQty = oldQty + qty;
  const newValue = oldQty * oldCost + qty * Number(unitCost);
  const newCost = newQty > 0.0000001 ? newValue / newQty : oldCost;

  await target.update({ quantity_on_hand: newQty, cost_price: newCost }, { transaction: t });

  await InventoryTransaction.create({
    company_id: companyId,
    item_id: item.id,
    branch_id: branchId || null,
    variant_id: variantId || null,
    type: type || 'purchase_receipt',
    reference_type: referenceType || 'invoice',
    reference_id: referenceId || null,
    date: date || new Date().toISOString().slice(0, 10),
    quantity: qty,
    unit_cost: unitCost,
    balance_qty_after: newQty,
    balance_value_after: newValue,
    notes: notes || null,
    created_by: userId || null,
  }, { transaction: t });

  return { item, label };
}

// Issues stock (e.g. a posted Sales Invoice line) at the CURRENT
// weighted-average cost, blocking the sale if it would take stock negative —
// a genuine oversell should be corrected via a stock adjustment or transfer
// first, not silently allowed to corrode the cost basis. Returns the COGS
// amount to post. Same branchId/variantId behavior as receiveStock above.
async function issueStock(companyId, itemId, { quantity, date, referenceType, referenceId, userId, notes, type, branchId, variantId }, t) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw badRequest('issueStock quantity must be greater than zero');

  const { item, target, label } = await resolveTarget(companyId, itemId, { branchId, variantId }, t);

  const oldQty = Number(target.quantity_on_hand);
  if (qty > oldQty + 0.001) {
    const where = branchId ? ' at this branch' : '';
    throw badRequest(`Insufficient stock for "${label}"${where}: have ${oldQty} ${item.unit}, tried to issue ${qty}`);
  }

  const unitCost = Number(target.cost_price);
  const cogsAmount = qty * unitCost;
  const newQty = oldQty - qty;

  await target.update({ quantity_on_hand: newQty }, { transaction: t });

  await InventoryTransaction.create({
    company_id: companyId,
    item_id: item.id,
    branch_id: branchId || null,
    variant_id: variantId || null,
    type: type || 'sale',
    reference_type: referenceType || 'invoice',
    reference_id: referenceId || null,
    date: date || new Date().toISOString().slice(0, 10),
    quantity: -qty,
    unit_cost: unitCost,
    balance_qty_after: newQty,
    balance_value_after: newQty * unitCost,
    notes: notes || null,
    created_by: userId || null,
  }, { transaction: t });

  return { item, unitCost, cogsAmount };
}

// Moves quantity of one or more items (each optionally a specific variant)
// from one location to another — either side may be a real Branch or the
// company's unbranched pool. Logged as a real StockTransfer document (header)
// with one StockTransferLine per item/variant, plus a matching
// transfer_out/transfer_in pair of InventoryTransaction rows per line, so both
// the transfer log and each item's own movement history stay fully auditable.
// The whole transfer is atomic: if any line has insufficient source stock,
// nothing in the transfer is applied.
async function transferStock(companyId, userId, { fromBranchId, toBranchId, date, notes, lines }, externalT) {
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('At least one line item is required');
  const from = fromBranchId || null;
  const to = toBranchId || null;
  if (from === to) throw badRequest('Source and destination must be different locations');

  const run = async (t) => {
    if (from) await validateBranch(companyId, from, t);
    if (to) await validateBranch(companyId, to, t);

    const transferDate = date || new Date().toISOString().slice(0, 10);
    const transfer_no = await nextTransferNo(companyId);

    const transfer = await StockTransfer.create({
      company_id: companyId, transfer_no, from_branch_id: from, to_branch_id: to, date: transferDate,
      notes: notes || null, created_by: userId || null,
    }, { transaction: t });

    let idx = 0;
    for (const line of lines) {
      const { item_id, variant_id, quantity } = line;
      if (!item_id) throw badRequest('Each transfer line needs an item_id');
      const qty = Number(quantity);
      if (!(qty > 0)) throw badRequest('Transfer quantity must be greater than zero');

      const { item, variant, label } = await resolveTarget(companyId, item_id, { branchId: from, variantId: variant_id || null }, t);

      // Issue at the source (mirrors issueStock's balance math, without going
      // through the invoice-oriented function since there's no COGS to post).
      const sourceTarget = variant_id && from
        ? await getOrCreateVariantBranchStock(companyId, variant_id, from, t)
        : variant_id
          ? variant
          : from
            ? await getOrCreateBranchStock(companyId, item_id, from, t)
            : await Item.findOne({ where: { id: item_id, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
      const sourceOldQty = Number(sourceTarget.quantity_on_hand);
      if (qty > sourceOldQty + 0.001) {
        throw badRequest(`Insufficient stock for "${label}" at the source location: have ${sourceOldQty} ${item.unit}, tried to transfer ${qty}`);
      }
      const unitCost = Number(sourceTarget.cost_price);
      const sourceNewQty = sourceOldQty - qty;
      await sourceTarget.update({ quantity_on_hand: sourceNewQty }, { transaction: t });

      // Receive at the destination, carrying the source's current weighted-average
      // cost forward as the "received" unit cost — an internal transfer doesn't
      // revalue stock, it just relocates it.
      const destTarget = variant_id && to
        ? await getOrCreateVariantBranchStock(companyId, variant_id, to, t)
        : variant_id
          ? await ItemVariant.findOne({ where: { id: variant_id, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE })
          : to
            ? await getOrCreateBranchStock(companyId, item_id, to, t)
            : await Item.findOne({ where: { id: item_id, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
      const destOldQty = Number(destTarget.quantity_on_hand);
      const destOldCost = Number(destTarget.cost_price);
      const destNewQty = destOldQty + qty;
      const destNewValue = destOldQty * destOldCost + qty * unitCost;
      const destNewCost = destNewQty > 0.0000001 ? destNewValue / destNewQty : destOldCost;
      await destTarget.update({ quantity_on_hand: destNewQty, cost_price: destNewCost }, { transaction: t });

      await StockTransferLine.create({
        transfer_id: transfer.id, item_id, variant_id: variant_id || null, quantity: qty, unit_cost: unitCost, line_order: idx,
      }, { transaction: t });

      await InventoryTransaction.create({
        company_id: companyId, item_id, variant_id: variant_id || null, branch_id: from,
        type: 'transfer_out', reference_type: 'transfer', reference_id: transfer.id,
        date: transferDate, quantity: -qty, unit_cost: unitCost,
        balance_qty_after: sourceNewQty, balance_value_after: sourceNewQty * unitCost,
        notes: notes || `Transfer ${transfer_no}`, created_by: userId || null,
      }, { transaction: t });

      await InventoryTransaction.create({
        company_id: companyId, item_id, variant_id: variant_id || null, branch_id: to,
        type: 'transfer_in', reference_type: 'transfer', reference_id: transfer.id,
        date: transferDate, quantity: qty, unit_cost: unitCost,
        balance_qty_after: destNewQty, balance_value_after: destNewValue,
        notes: notes || `Transfer ${transfer_no}`, created_by: userId || null,
      }, { transaction: t });

      idx += 1;
    }

    return transfer;
  };

  return externalT ? run(externalT) : sequelize.transaction(run);
}

// Sums an item's per-branch balances plus its unbranched pool into a single
// company-wide total — used wherever the old single-number "stock on hand"
// figure is still expected (Items list, PDF/Excel exports), so nothing that
// doesn't care about branches needs to change. If the item has variants, also
// includes each variant's own pool + per-branch breakdown.
async function getStockBreakdown(companyId, itemId) {
  const item = await Item.findOne({ where: { id: itemId, company_id: companyId } });
  if (!item) throw notFound();
  const branchRows = await ItemBranchStock.findAll({
    where: { item_id: itemId, company_id: companyId },
    include: [{ model: Branch, as: 'branch' }],
  });
  const totalQty = Number(item.quantity_on_hand) + branchRows.reduce((s, r) => s + Number(r.quantity_on_hand), 0);
  const totalValue = Number(item.quantity_on_hand) * Number(item.cost_price)
    + branchRows.reduce((s, r) => s + Number(r.quantity_on_hand) * Number(r.cost_price), 0);

  const variants = await ItemVariant.findAll({ where: { item_id: itemId, company_id: companyId } });
  const variantBreakdowns = await Promise.all(variants.map(async (v) => {
    const vBranchRows = await ItemVariantBranchStock.findAll({
      where: { variant_id: v.id, company_id: companyId },
      include: [{ model: Branch, as: 'branch' }],
    });
    const vTotalQty = Number(v.quantity_on_hand) + vBranchRows.reduce((s, r) => s + Number(r.quantity_on_hand), 0);
    const vTotalValue = Number(v.quantity_on_hand) * Number(v.cost_price)
      + vBranchRows.reduce((s, r) => s + Number(r.quantity_on_hand) * Number(r.cost_price), 0);
    return {
      variant_id: v.id, sku: v.sku, attributes: v.attributes,
      unbranched: { quantity_on_hand: Number(v.quantity_on_hand), cost_price: Number(v.cost_price) },
      branches: vBranchRows.map((r) => ({
        branch_id: r.branch_id, branch: r.branch, quantity_on_hand: Number(r.quantity_on_hand), cost_price: Number(r.cost_price),
      })),
      total_quantity_on_hand: vTotalQty,
      total_value: vTotalValue,
    };
  }));

  return {
    unbranched: { quantity_on_hand: Number(item.quantity_on_hand), cost_price: Number(item.cost_price) },
    branches: branchRows.map((r) => ({
      branch_id: r.branch_id, branch: r.branch, quantity_on_hand: Number(r.quantity_on_hand), cost_price: Number(r.cost_price),
    })),
    total_quantity_on_hand: totalQty,
    total_value: totalValue,
    variants: variantBreakdowns,
  };
}

// Manual correction (stock count, damage, etc). Positive delta re-runs the
// weighted-average calc with the given unit cost (defaults to current cost);
// negative delta issues stock at current cost and cannot take it negative.
// Optional branchId/variantId scope the adjustment the same way as
// receiveStock/issueStock above.
async function adjustStock(companyId, itemId, userId, { quantity_delta, unit_cost, date, notes, branchId, variantId }) {
  const delta = Number(quantity_delta);
  if (!delta) throw badRequest('quantity_delta must be non-zero');

  return sequelize.transaction(async (t) => {
    if (branchId) await validateBranch(companyId, branchId, t);
    if (variantId) await validateVariant(companyId, itemId, variantId, t);

    if (delta > 0) {
      const { target } = await resolveTarget(companyId, itemId, { branchId, variantId }, t);
      const currentCost = Number(target.cost_price);
      const cost = unit_cost !== undefined && unit_cost !== null ? Number(unit_cost) : currentCost;
      const result = await receiveStock(companyId, itemId, {
        quantity: delta, unitCost: cost, date, referenceType: 'manual', userId, notes: notes || 'Manual stock adjustment', type: 'adjustment', branchId, variantId,
      }, t);
      return result.item;
    }
    const result = await issueStock(companyId, itemId, {
      quantity: Math.abs(delta), date, referenceType: 'manual', userId, notes: notes || 'Manual stock adjustment', type: 'adjustment', branchId, variantId,
    }, t);
    return result.item;
  });
}

module.exports = {
  nextItemCode, createItem, updateItem, receiveStock, issueStock, adjustStock, validateAccount,
  transferStock, nextTransferNo, getOrCreateBranchStock, getOrCreateVariantBranchStock, getStockBreakdown, validateBranch,
  validateVariant, createVariant, updateVariant, deactivateVariant, resolveTarget,
};
