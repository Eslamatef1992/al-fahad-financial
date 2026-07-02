const { CostCenter } = require('../models');

exports.tree = async (req, res) => {
  const items = await CostCenter.findAll({ where: { company_id: req.companyId }, order: [['code', 'ASC']] });
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
  res.json(await CostCenter.findAll({ where: { company_id: req.companyId }, order: [['code', 'ASC']] }));
};

exports.create = async (req, res) => {
  res.status(201).json(await CostCenter.create({ ...req.body, company_id: req.companyId }));
};

exports.update = async (req, res) => {
  const item = await CostCenter.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Cost center not found' });
  await item.update(req.body);
  res.json(item);
};

exports.remove = async (req, res) => {
  const item = await CostCenter.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Cost center not found' });
  await item.update({ is_active: false });
  res.json({ message: 'Cost center deactivated' });
};
