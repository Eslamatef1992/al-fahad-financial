// Super-admin-facing damaged-inventory write-off log. Reporting a damage
// logs it without touching stock (so it can be reviewed/corrected first);
// clearing it is the moment the quantity actually leaves sellable inventory
// and its cost is recognized as a loss — same two-step "reserve, then
// actually move stock later" shape as ItemBooking's pending -> fulfilled,
// just for the opposite reason (stock leaving because it's ruined, not
// because it was sold).
const { sequelize, ItemDamage, Item, FinancialSetting } = require('../models');
const itemService = require('./itemService');
const voucherService = require('./voucherService');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Damage report not found'); e.status = 404; return e; }

const DAMAGE_TYPES = ['transport', 'warehouse', 'manufacturing_defect', 'customer_return', 'water_damage', 'other'];

async function reportDamage(companyId, userId, { item_id, variant_id, branch_id, quantity, damage_type, notes }) {
  if (!item_id) throw badRequest('item_id is required');
  const qty = Number(quantity);
  if (!(qty > 0)) throw badRequest('quantity must be greater than zero');
  if (damage_type && !DAMAGE_TYPES.includes(damage_type)) throw badRequest(`damage_type must be one of: ${DAMAGE_TYPES.join(', ')}`);

  const item = await Item.findOne({ where: { id: item_id, company_id: companyId } });
  if (!item) throw notFound('Item not found');

  return ItemDamage.create({
    company_id: companyId,
    item_id,
    variant_id: variant_id || null,
    branch_id: branch_id || null,
    quantity: qty,
    damage_type: damage_type || 'other',
    notes: notes || null,
    status: 'reported',
    reported_by: userId,
  });
}

async function listDamages(companyId, { status, item_id, branch_id } = {}) {
  const where = { company_id: companyId };
  if (status && status !== 'all') where.status = status;
  if (item_id) where.item_id = item_id;
  if (branch_id) where.branch_id = branch_id;
  return ItemDamage.findAll({
    where,
    order: [['createdAt', 'DESC']],
    include: [{ association: 'item' }, { association: 'variant' }, { association: 'branch' }, { association: 'reporter' }, { association: 'clearedByUser' }],
  });
}

// Writes the damage off for good: removes the quantity from on-hand stock at
// the item's current weighted-average cost, and posts Debit Damage Expense /
// Credit Inventory for that amount — the super admin's "clear it with zero"
// instruction interpreted as: it stops counting as inventory value and the
// loss is booked, exactly like any other inventory write-off would be.
async function clearDamage(companyId, userId, damageId) {
  return sequelize.transaction(async (t) => {
    const damage = await ItemDamage.findOne({ where: { id: damageId, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!damage) throw notFound();
    if (damage.status !== 'reported') throw badRequest('Only a reported (not yet cleared) damage can be cleared');

    const settings = await FinancialSetting.findOne({ where: { company_id: companyId }, transaction: t });

    const { item, unitCost, cogsAmount } = await itemService.issueStock(companyId, damage.item_id, {
      quantity: Number(damage.quantity),
      date: new Date().toISOString().slice(0, 10),
      referenceType: 'damage',
      referenceId: damage.id,
      userId,
      notes: `Damaged stock write-off (${damage.damage_type})`,
      type: 'adjustment', // InventoryTransaction.type is a Postgres ENUM — reuse 'adjustment'
      // rather than adding a new enum value; reference_type/reference_id + notes trace it as damage.
      branchId: damage.branch_id,
      variantId: damage.variant_id,
    }, t);

    let voucherId = null;
    const expenseAccountId = settings?.damage_expense_account_id || item.cogs_account_id;
    if (cogsAmount > 0.0009 && expenseAccountId) {
      const voucher = await voucherService.createVoucher(companyId, userId, {
        voucher_type: 'journal',
        date: new Date().toISOString().slice(0, 10),
        description: `Damaged goods write-off - ${item.name_en}`,
        lines: [
          { account_id: expenseAccountId, debit: cogsAmount, credit: 0, description: `Damage write-off - ${item.name_en}` },
          { account_id: item.inventory_account_id, debit: 0, credit: cogsAmount, description: `Damage write-off - ${item.name_en}` },
        ],
      }, t);
      await voucherService.postVoucher(companyId, voucher.id, t);
      voucherId = voucher.id;
    }

    await damage.update({
      status: 'cleared',
      cleared_at: new Date(),
      cleared_by: userId,
      unit_cost: unitCost,
      write_off_voucher_id: voucherId,
    }, { transaction: t });

    return damage;
  });
}

// Only a still-reported (not yet cleared) entry can be deleted — a cleared
// write-off already moved stock/GL and is permanent history, same rule as a
// posted voucher never being deletable.
async function deleteDamage(companyId, damageId) {
  const damage = await ItemDamage.findOne({ where: { id: damageId, company_id: companyId } });
  if (!damage) throw notFound();
  if (damage.status !== 'reported') throw badRequest('A cleared write-off cannot be deleted — it already adjusted stock and the ledger');
  await damage.destroy();
  return { id: damageId };
}

module.exports = { DAMAGE_TYPES, reportDamage, listDamages, clearDamage, deleteDamage };
