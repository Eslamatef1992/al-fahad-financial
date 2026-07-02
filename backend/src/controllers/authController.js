const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Company, UserCompany } = require('../models');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });
  if (!user || !user.is_active) return res.status(401).json({ message: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  user.last_login_at = new Date();
  await user.save();

  const companies = user.role === 'super_admin'
    ? (await Company.findAll({ where: { is_active: true } })).map((c) => ({ ...c.toJSON(), company_role: 'admin' }))
    : (await UserCompany.findAll({ where: { user_id: user.id }, include: [Company] }))
        .filter((uc) => uc.Company && uc.Company.is_active)
        .map((uc) => ({ ...uc.Company.toJSON(), company_role: uc.role }));

  res.json({
    token: signToken(user),
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role, preferred_lang: user.preferred_lang,
    },
    companies,
  });
};

exports.me = async (req, res) => {
  const companies = req.user.role === 'super_admin'
    ? (await Company.findAll({ where: { is_active: true } })).map((c) => ({ ...c.toJSON(), company_role: 'admin' }))
    : (await UserCompany.findAll({ where: { user_id: req.user.id }, include: [Company] }))
        .filter((uc) => uc.Company && uc.Company.is_active)
        .map((uc) => ({ ...uc.Company.toJSON(), company_role: uc.role }));

  res.json({ user: req.user, companies });
};

exports.register = async (req, res) => {
  // Only super_admin/admin should create users - route protected accordingly
  const { name, email, password, role, companyIds } = req.body;
  const password_hash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password_hash, role: role || 'accountant' });

  if (Array.isArray(companyIds)) {
    await Promise.all(companyIds.map((cid) => UserCompany.create({ user_id: user.id, company_id: cid })));
  }

  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters' });

  const ok = await bcrypt.compare(currentPassword || '', req.user.password_hash);
  if (!ok) return res.status(401).json({ message: 'Current password is incorrect' });

  req.user.password_hash = await bcrypt.hash(newPassword, 10);
  await req.user.save();
  res.json({ message: 'Password changed successfully' });
};
