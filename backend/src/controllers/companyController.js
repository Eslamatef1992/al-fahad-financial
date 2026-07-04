const fs = require('fs');
const path = require('path');
const { Company } = require('../models');
const { toPublicPath } = require('../middleware/upload');

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

// Uploads/replaces a company's logo. Stored as an actual file (not base64 in the DB)
// so it can be read straight off disk when stamping PDFs (invoices, vouchers, reports).
exports.uploadLogo = async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  // Best-effort cleanup of the previous logo file so they don't pile up.
  if (company.logo_url) {
    const oldPath = path.join(__dirname, '..', company.logo_url.replace(/^\/uploads\//, 'uploads/'));
    fs.unlink(oldPath, () => {});
  }

  const logo_url = toPublicPath(req.file, company.id, 'logo');
  await company.update({ logo_url });
  res.json(company);
};
