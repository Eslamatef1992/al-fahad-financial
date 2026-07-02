const bcrypt = require('bcryptjs');
const { User, Company, UserCompany } = require('../models');

const include = [{ model: Company, as: 'companies', through: { attributes: ['role'] } }];

// Super-admin only: manage all users across the whole group.
exports.list = async (req, res) => {
  const users = await User.findAll({
    include,
    attributes: { exclude: ['password_hash'] },
    order: [['name', 'ASC']],
  });
  res.json(users);
};

exports.get = async (req, res) => {
  const user = await User.findByPk(req.params.id, { include, attributes: { exclude: ['password_hash'] } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
};

exports.create = async (req, res) => {
  const { name, email, password, role, companyIds, companyRole } = req.body;
  const existing = await User.findOne({ where: { email } });
  if (existing) return res.status(400).json({ message: 'A user with this email already exists' });

  const password_hash = await bcrypt.hash(password || 'ChangeMe123!', 10);
  const user = await User.create({ name, email, password_hash, role: role || 'accountant' });

  if (Array.isArray(companyIds)) {
    await Promise.all(companyIds.map((cid) => UserCompany.create({ user_id: user.id, company_id: cid, role: companyRole || 'accountant' })));
  }

  const created = await User.findByPk(user.id, { include, attributes: { exclude: ['password_hash'] } });
  res.status(201).json(created);
};

exports.update = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const { name, role, is_active, preferred_lang } = req.body;
  await user.update({
    ...(name !== undefined && { name }),
    ...(role !== undefined && { role }),
    ...(is_active !== undefined && { is_active }),
    ...(preferred_lang !== undefined && { preferred_lang }),
  });

  const updated = await User.findByPk(user.id, { include, attributes: { exclude: ['password_hash'] } });
  res.json(updated);
};

exports.resetPassword = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  user.password_hash = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.json({ message: 'Password reset' });
};

exports.assignCompany = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const { company_id, role } = req.body;

  const [assignment] = await UserCompany.findOrCreate({
    where: { user_id: user.id, company_id },
    defaults: { role: role || 'accountant' },
  });
  if (assignment.role !== role && role) {
    assignment.role = role;
    await assignment.save();
  }

  const updated = await User.findByPk(user.id, { include, attributes: { exclude: ['password_hash'] } });
  res.json(updated);
};

exports.removeCompany = async (req, res) => {
  const deleted = await UserCompany.destroy({ where: { user_id: req.params.id, company_id: req.params.companyId } });
  if (!deleted) return res.status(404).json({ message: 'Assignment not found' });
  const updated = await User.findByPk(req.params.id, { include, attributes: { exclude: ['password_hash'] } });
  res.json(updated);
};
