const bcrypt = require('bcryptjs');
const { sequelize, User, UserCompany, Company, Branch, SalesPerson, PosOperator } = require('../models');

const bad = (m) => { const e = new Error(m); e.status = 400; return e; };
const cleanUser = (u) => String(u || '').trim().toLowerCase();
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;
const DEFAULT_PERMS = ['credit_sale'];

exports.list = async (req, res) => {
  const operators = await PosOperator.findAll({
    where: { company_id: req.companyId },
    include: [{ model: Branch, as: 'branch', attributes: ['id', 'code', 'name_en', 'name_ar'] }, { model: SalesPerson, as: 'salesperson', attributes: ['id', 'name_en', 'name_ar'] }],
    order: [['name', 'ASC']],
  });
  const branches = await Branch.findAll({ where: { company_id: req.companyId }, attributes: ['id', 'code', 'name_en', 'name_ar', 'pos_password_hash'], order: [['code', 'ASC']] });
  res.json({
    operators,
    branches: branches.map((b) => ({ id: b.id, code: b.code, name_en: b.name_en, name_ar: b.name_ar, has_password: !!b.pos_password_hash })),
  });
};

exports.create = async (req, res) => {
  const { name, username, password, branch_id, salesperson_id } = req.body || {};
  const uname = cleanUser(username);
  if (!name || !String(name).trim()) throw bad('Name is required');
  if (!USERNAME_RE.test(uname)) throw bad('Username must be 3-40 letters/numbers (. _ - allowed)');
  if (!password || String(password).length < 4) throw bad('Password must be at least 4 characters');
  const branch = await Branch.findOne({ where: { id: branch_id, company_id: req.companyId } });
  if (!branch) throw bad('Choose a branch');
  if (await PosOperator.findOne({ where: { company_id: req.companyId, username: uname } })) throw bad('This username is already used');
  const company = await Company.findByPk(req.companyId);
  const email = `${uname}.${String(company.code).toLowerCase()}@pos.local`;
  if (await User.findOne({ where: { email } })) throw bad('This username is already used');

  const op = await sequelize.transaction(async (t) => {
    const user = await User.create({ name: String(name).trim(), email, password_hash: await bcrypt.hash(String(password), 10), role: 'viewer', is_active: true }, { transaction: t });
    await UserCompany.create({ user_id: user.id, company_id: req.companyId, role: 'viewer', pos_role: 'cashier', pos_permissions: DEFAULT_PERMS }, { transaction: t });
    return PosOperator.create({ company_id: req.companyId, user_id: user.id, name: String(name).trim(), username: uname, branch_id: branch.id, salesperson_id: salesperson_id || null, is_active: true }, { transaction: t });
  });
  res.status(201).json(op);
};

exports.update = async (req, res) => {
  const op = await PosOperator.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!op) return res.status(404).json({ message: 'Operator not found' });
  const { name, password, branch_id, salesperson_id, is_active } = req.body || {};
  if (branch_id) {
    const branch = await Branch.findOne({ where: { id: branch_id, company_id: req.companyId } });
    if (!branch) throw bad('Unknown branch');
  }
  if (password && String(password).length < 4) throw bad('Password must be at least 4 characters');
  await sequelize.transaction(async (t) => {
    await op.update({
      ...(name ? { name: String(name).trim() } : {}),
      ...(branch_id ? { branch_id } : {}),
      ...(salesperson_id !== undefined ? { salesperson_id: salesperson_id || null } : {}),
      ...(is_active !== undefined ? { is_active: !!is_active } : {}),
    }, { transaction: t });
    const user = await User.findByPk(op.user_id, { transaction: t });
    if (user) {
      await user.update({
        ...(name ? { name: String(name).trim() } : {}),
        ...(is_active !== undefined ? { is_active: !!is_active } : {}),
        ...(password ? { password_hash: await bcrypt.hash(String(password), 10) } : {}),
      }, { transaction: t });
    }
  });
  res.json(op);
};

exports.remove = async (req, res) => {
  const op = await PosOperator.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!op) return res.status(404).json({ message: 'Operator not found' });
  // The backing user may own shifts/sales, so it is only deactivated, never deleted.
  await User.update({ is_active: false }, { where: { id: op.user_id } });
  await op.destroy();
  res.json({ ok: true });
};

// Shared password for a whole branch (anyone with it signs in and picks their name). Empty = disabled.
exports.setBranchPassword = async (req, res) => {
  const branch = await Branch.findOne({ where: { id: req.params.branchId, company_id: req.companyId } });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  const pw = String(req.body?.password || '');
  if (pw && pw.length < 4) throw bad('Password must be at least 4 characters');
  await branch.update({ pos_password_hash: pw ? await bcrypt.hash(pw, 10) : null });
  res.json({ id: branch.id, has_password: !!pw });
};
