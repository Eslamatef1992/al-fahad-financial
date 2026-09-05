const { FinancialSetting, Account } = require('../models');

const FIELDS = [
  'client_parent_account_id',
  'supplier_parent_account_id',
  'employee_parent_account_id',
  'employee_deduction_parent_account_id',
  'vehicle_parent_account_id',
  'vehicle_secondary_parent_account_id',
  'vehicle_tertiary_parent_account_id',
  'cost_center_parent_account_id',
  'item_inventory_account_id',
  'item_income_account_id',
  'item_cogs_account_id',
  'pos_cash_account_id',
  'pos_knet_account_id',
  'cash_control_account_id',
];

exports.get = async (req, res) => {
  const [settings] = await FinancialSetting.findOrCreate({
    where: { company_id: req.companyId },
    defaults: { company_id: req.companyId },
  });
  res.json(settings);
};

exports.update = async (req, res) => {
  const [settings] = await FinancialSetting.findOrCreate({
    where: { company_id: req.companyId },
    defaults: { company_id: req.companyId },
  });

  const patch = {};
  for (const field of FIELDS) {
    if (!(field in req.body)) continue;
    const value = req.body[field];
    if (!value) { patch[field] = null; continue; }
    const account = await Account.findOne({ where: { id: value, company_id: req.companyId } });
    if (!account) return res.status(400).json({ message: `Invalid account for ${field}` });
    patch[field] = account.id;
  }

  await settings.update(patch);
  res.json(settings);
};
