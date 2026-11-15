const { SalesPerson } = require('../models');

exports.list = async (req, res) => {
  const where = { company_id: req.companyId };
  if (req.query.status !== 'all') where.is_active = true;
  res.json(await SalesPerson.findAll({ where, order: [['name_en', 'ASC']] }));
};
exports.create = async (req, res) => {
  const { name_en, name_ar, phone, user_id, branch_id } = req.body;
  if (!String(name_en || '').trim()) return res.status(400).json({ message: 'Name is required' });
  res.status(201).json(await SalesPerson.create({ company_id: req.companyId, name_en: name_en.trim(), name_ar: name_ar || null, phone: phone || null, user_id: user_id || null, branch_id: branch_id || null }));
};
exports.update = async (req, res) => {
  const row = await SalesPerson.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!row) return res.status(404).json({ message: 'Sales person not found' });
  const b = req.body; const out = {};
  ['name_en', 'name_ar', 'phone'].forEach((k) => { if (b[k] !== undefined) out[k] = String(b[k] || '').trim() || null; });
  ['user_id', 'branch_id'].forEach((k) => { if (b[k] !== undefined) out[k] = b[k] || null; });
  if (b.is_active !== undefined) out.is_active = !!b.is_active;
  if (out.name_en === null) return res.status(400).json({ message: 'Name is required' });
  await row.update(out);
  res.json(row);
};
