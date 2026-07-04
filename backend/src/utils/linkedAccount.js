const { Account } = require('../models');

// When a Client/Supplier/Vehicle is created with a chosen "parent_account_id" (e.g. the
// Accounts Payable control account 2100), this creates a real sub-account in the dynamic
// Chart of Accounts directly under that parent, using the entity's own code/name, and marks
// the parent as a group account. The new account's id is what gets stored on the entity's
// `account_id` so vouchers/invoices can post straight to it.
async function createLinkedAccount({ companyId, parentAccountId, code, name_en, name_ar, opening_balance }, t) {
  const parent = await Account.findOne({ where: { id: parentAccountId, company_id: companyId }, transaction: t });
  if (!parent) { const e = new Error('Parent account not found'); e.status = 400; throw e; }

  if (!parent.is_group) {
    parent.is_group = true;
    await parent.save({ transaction: t });
  }

  return Account.create({
    company_id: companyId,
    parent_id: parent.id,
    code,
    name_en,
    name_ar,
    type: parent.type,
    normal_balance: parent.normal_balance,
    currency: parent.currency,
    level: parent.level + 1,
    is_group: false,
    opening_balance: opening_balance || 0,
  }, { transaction: t });
}

// Keeps an already-linked account's code/name/opening balance/parent in sync when the
// entity is edited later, so the Chart of Accounts never drifts out of step.
async function syncLinkedAccount(accountId, { code, name_en, name_ar, opening_balance, parent_id }, t) {
  if (!accountId) return null;
  const account = await Account.findByPk(accountId, { transaction: t });
  if (!account) return null;

  const patch = {};
  if (code !== undefined) patch.code = code;
  if (name_en !== undefined) patch.name_en = name_en;
  if (name_ar !== undefined) patch.name_ar = name_ar;
  if (opening_balance !== undefined) patch.opening_balance = opening_balance;

  if (parent_id && parent_id !== account.parent_id) {
    const parent = await Account.findByPk(parent_id, { transaction: t });
    if (parent) {
      patch.parent_id = parent_id;
      patch.level = parent.level + 1;
      if (!parent.is_group) {
        parent.is_group = true;
        await parent.save({ transaction: t });
      }
    }
  }

  await account.update(patch, { transaction: t });
  return account;
}

module.exports = { createLinkedAccount, syncLinkedAccount };
