const { Company } = require('../models');

exports.list = async (req, res) => {
  const companies = await Company.findAll({ order: [['name_en', 'ASC']] });
  res.json(companies);
};

exports.create = async (req, res) => {
  const company = await Company.create(req.body);
  res.status(201).json(company);
};

exports.update = async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  await company.update(req.body);
  res.json(company);
};

exports.remove = async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  await company.update({ is_active: false });
  res.json({ message: 'Company deactivated' });
};
