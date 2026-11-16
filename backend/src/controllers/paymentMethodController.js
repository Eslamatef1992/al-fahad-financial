const { Op } = require('sequelize');
const { PaymentMethod, Account, Branch } = require('../models');
const INC = (extra = []) => [{ model: Account, as: 'account', attributes: ['id', 'code', 'name_en', 'name_ar'] }, { model: Branch, as: 'branch', attributes: ['id', 'code', 'name_en', 'name_ar'], required: false }, ...extra];

exports.list = async (req, res) => {
  const { status, branch_id } = req.query;
  const where = { company_id: req.companyId };
  // branch_id given => methods for that branch plus the all-branch ones.
  if (branch_id) where[Op.or] = [{ branch_id: null }, { branch_id }];
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  res.json(await PaymentMethod.findAll({
    where,
    order: [['name_en', 'ASC']],
    include: INC(),
  }));
};

exports.create = async (req, res) => {
  const { name_en, name_ar, account_id, branch_id } = req.body;
  if (!name_en || !name_ar) return res.status(400).json({ message: 'name_en and name_ar are required' });
  if (!account_id) return res.status(400).json({ message: 'account_id is required' });

  const account = await Account.findOne({ where: { id: account_id, company_id: req.companyId } });
  if (!account) return res.status(400).json({ message: 'Linked account not found for this company' });

  const created = await PaymentMethod.create({ company_id: req.companyId, name_en, name_ar, account_id, branch_id: branch_id || null });
  const withAccount = await PaymentMethod.findByPk(created.id, { include: INC() });
  res.status(201).json(withAccount);
};

exports.update = async (req, res) => {
  const method = await PaymentMethod.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!method) return res.status(404).json({ message: 'Payment method not found' });

  const { name_en, name_ar, account_id, is_active, branch_id } = req.body;
  if (account_id) {
    const account = await Account.findOne({ where: { id: account_id, company_id: req.companyId } });
    if (!account) return res.status(400).json({ message: 'Linked account not found for this company' });
  }

  await method.update({
    ...(name_en !== undefined ? { name_en } : {}),
    ...(name_ar !== undefined ? { name_ar } : {}),
    ...(account_id !== undefined ? { account_id } : {}),
    ...(is_active !== undefined ? { is_active } : {}),
    ...(branch_id !== undefined ? { branch_id: branch_id || null } : {}),
  });
  const withAccount = await PaymentMethod.findByPk(method.id, { include: INC() });
  res.json(withAccount);
};

exports.remove = async (req, res) => {
  const method = await PaymentMethod.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!method) return res.status(404).json({ message: 'Payment method not found' });
  await method.update({ is_active: false });
  res.json({ message: 'Payment method deactivated' });
};
