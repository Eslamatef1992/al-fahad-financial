const { sequelize, Supplier, Account } = require('../models');
const crudFactory = require('../utils/crudFactory');
const { createLinkedAccount, syncLinkedAccount } = require('../utils/linkedAccount');

const base = crudFactory(Supplier, { include: [{ model: Account, as: 'account' }], searchFields: ['name_en', 'name_ar', 'code', 'phone', 'email'] });

exports.list = base.list;
exports.get = base.get;
exports.remove = base.remove;

// Creating a supplier can optionally auto-create its ledger sub-account nested directly
// under a chosen control account (e.g. Accounts Payable), using the supplier's own code.
exports.create = async (req, res) => {
  const { parent_account_id, ...body } = req.body;
  const created = await sequelize.transaction(async (t) => {
    let account_id = null;
    if (parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId,
        parentAccountId: parent_account_id,
        code: body.code,
        name_en: body.name_en,
        name_ar: body.name_ar,
        opening_balance: body.opening_balance,
      }, t);
      account_id = account.id;
    }
    return Supplier.create({ ...body, account_id, company_id: req.companyId }, { transaction: t });
  });
  const withAccount = await Supplier.findOne({ where: { id: created.id }, include: [{ model: Account, as: 'account' }] });
  res.status(201).json(withAccount);
};

exports.update = async (req, res) => {
  const { parent_account_id, ...body } = req.body;
  const item = await Supplier.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Not found' });

  await sequelize.transaction(async (t) => {
    let account_id = item.account_id;
    if (!account_id && parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: parent_account_id,
        code: body.code, name_en: body.name_en, name_ar: body.name_ar, opening_balance: body.opening_balance,
      }, t);
      account_id = account.id;
    } else if (account_id) {
      await syncLinkedAccount(account_id, {
        code: body.code, name_en: body.name_en, name_ar: body.name_ar,
        opening_balance: body.opening_balance, parent_id: parent_account_id,
      }, t);
    }
    await item.update({ ...body, account_id }, { transaction: t });
  });

  const updated = await Supplier.findOne({ where: { id: item.id }, include: [{ model: Account, as: 'account' }] });
  res.json(updated);
};
