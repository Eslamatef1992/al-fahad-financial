const { ItemCategory } = require('../models');

exports.list = async (req, res) => {
  const { status } = req.query;
  const where = { company_id: req.companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  res.json(await ItemCategory.findAll({ where, order: [['name_en', 'ASC']] }));
};

// Quick-add friendly: only name_en is required (name_ar defaults to the same
// text) so a category can be created inline, in one field, right from the
// Item form's dropdown — no need to leave the page.
exports.create = async (req, res) => {
  const { name_en, name_ar } = req.body;
  if (!name_en) return res.status(400).json({ message: 'name_en is required' });
  const created = await ItemCategory.create({
    company_id: req.companyId, name_en, name_ar: name_ar || name_en,
  });
  res.status(201).json(created);
};

exports.update = async (req, res) => {
  const item = await ItemCategory.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Category not found' });
  await item.update(req.body);
  res.json(item);
};

exports.remove = async (req, res) => {
  const item = await ItemCategory.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Category not found' });
  await item.update({ is_active: false });
  res.json({ message: 'Category deactivated' });
};
