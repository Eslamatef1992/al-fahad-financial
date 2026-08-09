const { sequelize, Item, InventoryTransaction, Account } = require('../models');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Item not found'); e.status = 404; return e; }

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

// Creates a new inventory item. If opening_quantity/opening_cost are given,
// seeds the initial stock balance and logs a matching 'opening' movement so
// the balance is traceable from day one, exactly like any other stock change.
async function createItem(companyId, userId, payload) {
  const {
    name_en, name_ar, category, unit, inventory_account_id, income_account_id, cogs_account_id,
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
      name_en,
      name_ar,
      category: category || null,
      unit: unit || 'pcs',
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
  const { name_en, name_ar, category, unit, inventory_account_id, income_account_id, cogs_account_id, selling_price, reorder_level, is_active } = payload;

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

// Receives stock (e.g. a posted Purchase Bill line) and recomputes the
// item's running weighted-average cost:
//   new_avg_cost = (old_qty * old_avg_cost + received_qty * received_unit_cost) / (old_qty + received_qty)
// Runs inside the caller's transaction so it stays atomic with whatever
// posted the ledger entries that triggered this receipt.
async function receiveStock(companyId, itemId, { quantity, unitCost, date, referenceType, referenceId, userId, notes, type }, t) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw badRequest('receiveStock quantity must be greater than zero');

  const item = await Item.findOne({ where: { id: itemId, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!item) throw notFound();

  const oldQty = Number(item.quantity_on_hand);
  const oldCost = Number(item.cost_price);
  const newQty = oldQty + qty;
  const newValue = oldQty * oldCost + qty * Number(unitCost);
  const newCost = newQty > 0.0000001 ? newValue / newQty : oldCost;

  await item.update({ quantity_on_hand: newQty, cost_price: newCost }, { transaction: t });

  await InventoryTransaction.create({
    company_id: companyId,
    item_id: item.id,
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

  return item;
}

// Issues stock (e.g. a posted Sales Invoice line) at the item's CURRENT
// weighted-average cost, blocking the sale if it would take stock negative —
// a genuine oversell should be corrected via a stock adjustment first, not
// silently allowed to corrode the cost basis. Returns the COGS amount to post.
async function issueStock(companyId, itemId, { quantity, date, referenceType, referenceId, userId, notes, type }, t) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw badRequest('issueStock quantity must be greater than zero');

  const item = await Item.findOne({ where: { id: itemId, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!item) throw notFound();

  const oldQty = Number(item.quantity_on_hand);
  if (qty > oldQty + 0.001) {
    throw badRequest(`Insufficient stock for "${item.name_en}": have ${oldQty} ${item.unit}, tried to issue ${qty}`);
  }

  const unitCost = Number(item.cost_price);
  const cogsAmount = qty * unitCost;
  const newQty = oldQty - qty;

  await item.update({ quantity_on_hand: newQty }, { transaction: t });

  await InventoryTransaction.create({
    company_id: companyId,
    item_id: item.id,
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

// Manual correction (stock count, damage, etc). Positive delta re-runs the
// weighted-average calc with the given unit cost (defaults to current cost);
// negative delta issues stock at current cost and cannot take it negative.
async function adjustStock(companyId, itemId, userId, { quantity_delta, unit_cost, date, notes }) {
  const delta = Number(quantity_delta);
  if (!delta) throw badRequest('quantity_delta must be non-zero');

  return sequelize.transaction(async (t) => {
    if (delta > 0) {
      const item = await Item.findOne({ where: { id: itemId, company_id: companyId }, transaction: t });
      if (!item) throw notFound();
      const cost = unit_cost !== undefined && unit_cost !== null ? Number(unit_cost) : Number(item.cost_price);
      return receiveStock(companyId, itemId, {
        quantity: delta, unitCost: cost, date, referenceType: 'manual', userId, notes: notes || 'Manual stock adjustment', type: 'adjustment',
      }, t);
    }
    const result = await issueStock(companyId, itemId, {
      quantity: Math.abs(delta), date, referenceType: 'manual', userId, notes: notes || 'Manual stock adjustment', type: 'adjustment',
    }, t);
    return result.item;
  });
}

module.exports = { nextItemCode, createItem, updateItem, receiveStock, issueStock, adjustStock, validateAccount };
