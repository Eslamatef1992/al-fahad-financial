const { sequelize, CostCenter, Account } = require('../models');
const { createLinkedAccount, syncLinkedAccount } = require('../utils/linkedAccount');
const { nextCode } = require('../utils/codeGenerator');

const include = [{ model: Account, as: 'account' }];

exports.tree = async (req, res) => {
  const items = await CostCenter.findAll({ where: { company_id: req.companyId }, include, order: [['code', 'ASC']] });
  const byId = {};
  items.forEach((a) => { byId[a.id] = { ...a.toJSON(), children: [] }; });
  const roots = [];
  items.forEach((a) => {
    if (a.parent_id && byId[a.parent_id]) byId[a.parent_id].children.push(byId[a.id]);
    else roots.push(byId[a.id]);
  });
  res.json(roots);
};

exports.list = async (req, res) => {
  res.json(await CostCenter.findAll({ where: { company_id: req.companyId }, include, order: [['code', 'ASC']] }));
};

// Creating a cost center always gets a system-generated code (CC-00001, CC-00002, ...) —
// any client-supplied code is ignored. It can optionally also auto-create its ledger
// sub-account nested directly under a chosen control account, using that generated
// code — same pattern as Clients/Suppliers/Vehicles/Employees. This is independent of
// `parent_id`, which is the cost center's own tree hierarchy (unrelated to the chart
// of accounts).
exports.create = async (req, res) => {
  const { parent_account_id, code, ...body } = req.body;
  const created = await sequelize.transaction(async (t) => {
    const finalCode = await nextCode(CostCenter, req.companyId, 'CC');
    let account_id = null;
    if (parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: parent_account_id,
        code: finalCode, name_en: body.name_en, name_ar: body.name_ar, opening_balance: 0,
      }, t);
      account_id = account.id;
    }
    return CostCenter.create({ ...body, code: finalCode, account_id, company_id: req.companyId }, { transaction: t });
  });
  const withAccount = await CostCenter.findOne({ where: { id: created.id }, include });
  res.status(201).json(withAccount);
};

exports.update = async (req, res) => {
  const { parent_account_id, code, ...body } = req.body; // code is immutable after creation
  const item = await CostCenter.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Cost center not found' });

  await sequelize.transaction(async (t) => {
    let account_id = item.account_id;
    if (!account_id && parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: parent_account_id,
        code: item.code, name_en: body.name_en, name_ar: body.name_ar, opening_balance: 0,
      }, t);
      account_id = account.id;
    } else if (account_id) {
      await syncLinkedAccount(account_id, {
        name_en: body.name_en, name_ar: body.name_ar, parent_id: parent_account_id,
      }, t);
    }
    await item.update({ ...body, account_id }, { transaction: t });
  });

  const updated = await CostCenter.findOne({ where: { id: item.id }, include });
  res.json(updated);
};

exports.remove = async (req, res) => {
  const item = await CostCenter.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Cost center not found' });
  await item.update({ is_active: false });
  res.json({ message: 'Cost center deactivated' });
};
