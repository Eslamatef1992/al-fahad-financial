const { Account } = require('../models');

// Returns full chart of accounts as a nested tree for the active company
exports.tree = async (req, res) => {
  const accounts = await Account.findAll({
    where: { company_id: req.companyId },
    order: [['code', 'ASC']],
  });

  const byId = {};
  accounts.forEach((a) => { byId[a.id] = { ...a.toJSON(), children: [] }; });
  const roots = [];
  accounts.forEach((a) => {
    if (a.parent_id && byId[a.parent_id]) {
      byId[a.parent_id].children.push(byId[a.id]);
    } else {
      roots.push(byId[a.id]);
    }
  });
  res.json(roots);
};

exports.list = async (req, res) => {
  const accounts = await Account.findAll({ where: { company_id: req.companyId }, order: [['code', 'ASC']] });
  res.json(accounts);
};

exports.create = async (req, res) => {
  const { parent_id } = req.body;
  let level = 1;
  if (parent_id) {
    const parent = await Account.findByPk(parent_id);
    if (!parent) return res.status(400).json({ message: 'Parent account not found' });
    level = parent.level + 1;
    // A group account cannot receive direct postings once it has children
    if (!parent.is_group) {
      parent.is_group = true;
      await parent.save();
    }
  }
  const account = await Account.create({ ...req.body, company_id: req.companyId, level });
  res.status(201).json(account);
};

exports.update = async (req, res) => {
  const account = await Account.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!account) return res.status(404).json({ message: 'Account not found' });
  await account.update(req.body);
  res.json(account);
};

exports.remove = async (req, res) => {
  const account = await Account.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!account) return res.status(404).json({ message: 'Account not found' });

  const childCount = await Account.count({ where: { parent_id: account.id } });
  if (childCount > 0) return res.status(400).json({ message: 'Cannot delete an account that has sub-accounts' });

  await account.update({ is_active: false });
  res.json({ message: 'Account deactivated' });
};
