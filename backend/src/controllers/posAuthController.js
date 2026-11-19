// Public sign-in for the POS-only site (pos.<domain>): pick a branch, then either
// username + password (personal operator) or the branch's shared password + sales person.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, UserCompany, Company, Branch, SalesPerson, PosOperator } = require('../models');

const bad = (m, s = 400) => { const e = new Error(m); e.status = s; return e; };

// Tiny in-memory brute-force guard: 10 failed attempts per IP per 10 minutes.
const fails = new Map();
function guard(req) {
  const k = req.ip; const now = Date.now();
  const rec = (fails.get(k) || []).filter((t) => now - t < 10 * 60 * 1000);
  fails.set(k, rec);
  if (rec.length >= 10) throw bad('Too many attempts. Try again in a few minutes.', 429);
}
const fail = (req) => { const rec = fails.get(req.ip) || []; rec.push(Date.now()); fails.set(req.ip, rec); };

function signPosToken(user, { branch_id, salesperson_id }) {
  return jwt.sign({ sub: user.id, role: user.role, pos: true, pb: branch_id, sp: salesperson_id || null }, process.env.JWT_SECRET, { expiresIn: '12h' });
}

async function session(user, company, branch, salesperson_id, label) {
  user.last_login_at = new Date(); await user.save();
  return {
    token: signPosToken(user, { branch_id: branch.id, salesperson_id }),
    user: { id: user.id, name: label || user.name, email: user.email, role: user.role, preferred_lang: user.preferred_lang, pos_only: true, pos_branch_id: branch.id, pos_salesperson_id: salesperson_id || null },
    companies: [{ ...company.toJSON(), company_role: 'viewer' }],
  };
}

exports.branches = async (req, res) => {
  const ops = await PosOperator.findAll({ where: { is_active: true }, attributes: ['branch_id'], raw: true });
  const opBranches = new Set(ops.map((o) => o.branch_id));
  const branches = await Branch.findAll({ where: { is_active: true }, include: [{ model: Company }], order: [['code', 'ASC']] });
  res.json(branches
    .filter((b) => b.Company?.is_active && (b.pos_password_hash || opBranches.has(b.id)))
    .map((b) => ({
      id: b.id, code: b.code, name_en: b.name_en, name_ar: b.name_ar,
      company_name_en: b.Company.name_en, company_name_ar: b.Company.name_ar,
      has_branch_password: !!b.pos_password_hash, has_operators: opBranches.has(b.id),
    })));
};

exports.salespeople = async (req, res) => {
  const branch = await Branch.findByPk(req.query.branch_id);
  if (!branch || !branch.is_active) return res.json([]);
  const rows = await SalesPerson.findAll({
    where: { company_id: branch.company_id, is_active: true, [Op.or]: [{ branch_id: null }, { branch_id: branch.id }] },
    attributes: ['id', 'name_en', 'name_ar'], order: [['name_en', 'ASC']],
  });
  res.json(rows);
};

exports.login = async (req, res) => {
  guard(req);
  const { branch_id, username, password } = req.body || {};
  const branch = await Branch.findByPk(branch_id);
  if (!branch || !branch.is_active) throw bad('Choose a branch');
  const op = await PosOperator.findOne({ where: { company_id: branch.company_id, username: String(username || '').trim().toLowerCase(), is_active: true } });
  const user = op ? await User.findByPk(op.user_id) : null;
  if (!op || !user || !user.is_active || !(await bcrypt.compare(String(password || ''), user.password_hash))) { fail(req); throw bad('Wrong username or password', 401); }
  if (op.branch_id !== branch.id) throw bad('This user is not assigned to the selected branch', 403);
  const company = await Company.findByPk(branch.company_id);
  res.json(await session(user, company, branch, op.salesperson_id, op.name));
};

exports.branchLogin = async (req, res) => {
  guard(req);
  const { branch_id, password, salesperson_id } = req.body || {};
  const branch = await Branch.findByPk(branch_id);
  if (!branch || !branch.is_active || !branch.pos_password_hash) throw bad('Branch password sign-in is not enabled for this branch', 403);
  if (!(await bcrypt.compare(String(password || ''), branch.pos_password_hash))) { fail(req); throw bad('Wrong branch password', 401); }
  let sp = null;
  if (salesperson_id) {
    sp = await SalesPerson.findOne({ where: { id: salesperson_id, company_id: branch.company_id, is_active: true } });
    if (!sp) throw bad('Unknown sales person');
  }
  const company = await Company.findByPk(branch.company_id);
  // Shared hidden user for the branch (created on first use).
  let user = branch.pos_shared_user_id ? await User.findByPk(branch.pos_shared_user_id) : null;
  if (!user) {
    user = await User.create({
      name: `POS ${branch.name_en}`, email: `pos-branch-${branch.id}@pos.local`,
      password_hash: await bcrypt.hash(`${branch.id}-${Date.now()}-${Math.random()}`, 10), role: 'viewer', is_active: true,
    });
    await UserCompany.create({ user_id: user.id, company_id: branch.company_id, role: 'viewer', pos_role: 'cashier', pos_permissions: ['credit_sale'] });
    await branch.update({ pos_shared_user_id: user.id });
  }
  const label = sp ? (sp.name_en) : user.name;
  res.json(await session(user, company, branch, sp?.id || null, label));
};
