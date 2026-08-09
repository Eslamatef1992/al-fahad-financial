const { Branch, Account, Company } = require('../models');
const { nextCode } = require('../utils/codeGenerator');
const { exportBranches } = require('../services/excelService');
const { generateBranchesPdf } = require('../services/pdfService');

const accountsInclude = [{ model: Account, as: 'accounts' }];

// Only keeps account_ids that actually belong to this company, so a stray or
// cross-company id in the request body can never link a branch to an
// account it has no business seeing.
async function sanitizeAccountIds(companyId, accountIds) {
  if (!Array.isArray(accountIds) || accountIds.length === 0) return [];
  const rows = await Account.findAll({ where: { id: accountIds, company_id: companyId } });
  return rows.map((a) => a.id);
}

exports.list = async (req, res) => {
  const { status } = req.query;
  const where = { company_id: req.companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  res.json(await Branch.findAll({ where, include: accountsInclude, order: [['code', 'ASC']] }));
};

exports.get = async (req, res) => {
  const item = await Branch.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: accountsInclude });
  if (!item) return res.status(404).json({ message: 'Branch not found' });
  res.json(item);
};

// Always gets a system-generated code (BR-00001, BR-00002, ...), same convention as Suppliers/Clients/Cost Centers.
// account_ids is an open-ended list of Chart-of-Accounts accounts this branch
// should be linked to for reference/reporting — unlike Cost Center's single
// account_id, a branch can list any number of them (or none).
exports.create = async (req, res) => {
  const { code, account_ids, ...body } = req.body;
  const finalCode = await nextCode(Branch, req.companyId, 'BR');
  const created = await Branch.create({ ...body, code: finalCode, company_id: req.companyId });
  const validAccountIds = await sanitizeAccountIds(req.companyId, account_ids);
  if (validAccountIds.length) await created.setAccounts(validAccountIds);
  const withAccounts = await Branch.findByPk(created.id, { include: accountsInclude });
  res.status(201).json(withAccounts);
};

exports.update = async (req, res) => {
  const { code, account_ids, ...body } = req.body; // code is immutable after creation
  const item = await Branch.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Branch not found' });
  await item.update(body);
  if (Array.isArray(account_ids)) {
    const validAccountIds = await sanitizeAccountIds(req.companyId, account_ids);
    await item.setAccounts(validAccountIds); // empty array clears all links
  }
  const withAccounts = await Branch.findByPk(item.id, { include: accountsInclude });
  res.json(withAccounts);
};

exports.remove = async (req, res) => {
  const item = await Branch.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Branch not found' });
  await item.update({ is_active: false });
  res.json({ message: 'Branch deactivated' });
};

exports.exportExcel = async (req, res) => {
  const rows = await Branch.findAll({ where: { company_id: req.companyId, is_active: true }, include: accountsInclude, order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  await exportBranches(res, company, rows);
};

exports.pdf = async (req, res) => {
  const rows = await Branch.findAll({ where: { company_id: req.companyId, is_active: true }, include: accountsInclude, order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  generateBranchesPdf(res, rows, company);
};
