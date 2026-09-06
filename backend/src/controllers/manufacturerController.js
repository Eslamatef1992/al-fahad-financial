const { Manufacturer } = require('../models');

exports.list = async (req, res) => {
  const { status } = req.query;
  const where = { company_id: req.companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  res.json(await Manufacturer.findAll({ where, order: [['name_en', 'ASC']] }));
};

// Quick-add friendly: only name_en is required (name_ar defaults to the same
// text), matching the ItemCategory pattern, so a manufacturer can be created
// inline from a dropdown without leaving the page.
exports.create = async (req, res) => {
  const { name_en, name_ar, phone, address } = req.body;
  if (!name_en) return res.status(400).json({ message: 'name_en is required' });
  const created = await Manufacturer.create({
    company_id: req.companyId, name_en, name_ar: name_ar || name_en, phone, address,
  });
  res.status(201).json(created);
};

exports.update = async (req, res) => {
  const item = await Manufacturer.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Manufacturer not found' });
  await item.update(req.body);
  res.json(item);
};

exports.remove = async (req, res) => {
  const item = await Manufacturer.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Manufacturer not found' });
  await item.update({ is_active: false });
  res.json({ message: 'Manufacturer deactivated' });
};
