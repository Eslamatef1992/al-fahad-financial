const { PaymentMethod, Account } = require('../models');

exports.list = async (req, res) => {
  const { status } = req.query;
  const where = { company_id: req.companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  res.json(await PaymentMethod.findAll({
    where,
    order: [['name_en', 'ASC']],
    include: [{ model: Account, as: 'account', attributes: ['id', 'code', 'name_en', 'name_ar'] }],
  }));
};

exports.create = async (req, res) => {
  const { name_en, name_ar, account_id } = req.body;
  if (!name_en || !name_ar) return res.status(400).json({ message: 'name_en and name_ar are required' });
  if (!account_id) return res.status(400).json({ message: 'account_id is required' });

  const account = await Account.findOne({ where: { id: account_id, company_id: req.companyId } });
  if (!account) return res.status(400).json({ message: 'Linked account not found for this company' });

  const created = await PaymentMethod.create({ company_id: req.companyId, name_en, name_ar, account_id });
  const withAccount = await PaymentMethod.findByPk(created.id, { include: [{ model: Account, as: 'account', attributes: ['id', 'code', 'name_en', 'name_ar'] }] });
  res.status(201).json(withAccount);
};

exports.update = async (req, res) => {
  const method = await PaymentMethod.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!method) return res.status(404).json({ message: 'Payment method not found' });

  const { name_en, name_ar, account_id, is_active } = req.body;
  if (account_id) {
    const account = await Account.findOne({ where: { id: account_id, company_id: req.companyId } });
    if (!account) return res.status(400).json({ message: 'Linked account not found for this company' });
  }

  await method.update({
    ...(name_en !== undefined ? { name_en } : {}),
    ...(name_ar !== undefined ? { name_ar } : {}),
    ...(account_id !== undefined ? { account_id } : {}),
    ...(is_active !== undefined ? { is_active } : {}),
  });
  const withAccount = await PaymentMethod.findByPk(method.id, { include: [{ model: Account, as: 'account', attributes: ['id', 'code', 'name_en', 'name_ar'] }] });
  res.json(withAccount);
};

exports.remove = async (req, res) => {
  const method = await PaymentMethod.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!method) return res.status(404).json({ message: 'Payment method not found' });
  await method.update({ is_active: false });
  res.json({ message: 'Payment method deactivated' });
};
