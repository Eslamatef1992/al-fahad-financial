const { Branch, Company } = require('../models');
const { nextCode } = require('../utils/codeGenerator');
const { exportBranches } = require('../services/excelService');
const { generateBranchesPdf } = require('../services/pdfService');

exports.list = async (req, res) => {
  const { status } = req.query;
  const where = { company_id: req.companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  res.json(await Branch.findAll({ where, order: [['code', 'ASC']] }));
};

exports.get = async (req, res) => {
  const item = await Branch.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Branch not found' });
  res.json(item);
};

// Always gets a system-generated code (BR-00001, BR-00002, ...), same convention as Suppliers/Clients/Cost Centers.
exports.create = async (req, res) => {
  const { code, ...body } = req.body;
  const finalCode = await nextCode(Branch, req.companyId, 'BR');
  const created = await Branch.create({ ...body, code: finalCode, company_id: req.companyId });
  res.status(201).json(created);
};

exports.update = async (req, res) => {
  const { code, ...body } = req.body; // code is immutable after creation
  const item = await Branch.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Branch not found' });
  await item.update(body);
  res.json(item);
};

exports.remove = async (req, res) => {
  const item = await Branch.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Branch not found' });
  await item.update({ is_active: false });
  res.json({ message: 'Branch deactivated' });
};

exports.exportExcel = async (req, res) => {
  const rows = await Branch.findAll({ where: { company_id: req.companyId, is_active: true }, order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  await exportBranches(res, company, rows);
};

exports.pdf = async (req, res) => {
  const rows = await Branch.findAll({ where: { company_id: req.companyId, is_active: true }, order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  generateBranchesPdf(res, rows, company);
};
