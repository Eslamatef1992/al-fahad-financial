const { UserCompany, User, Branch } = require('../models');
const posService = require('../services/posService');
const { effectiveRole } = require('../middleware/permissions');

async function profileFor(req) {
  return posService.getPosProfile(req.companyId, req.user.id, req.user.role === 'super_admin', effectiveRole(req));
}

exports.myAccess = async (req, res) => {
  const profile = await profileFor(req);
  const shift = await posService.getOpenShift(req.companyId, req.user.id);
  res.json({ level: profile.level, posPermissions: profile.posPermissions, shift });
};

exports.openShift = async (req, res) => {
  const profile = await profileFor(req);
  if (!profile.hasAccess) return res.status(403).json({ message: 'You do not have POS access' });
  const shift = await posService.openShift(req.companyId, req.user.id, req.body);
  res.status(201).json(shift);
};

exports.closeShift = async (req, res) => {
  const shift = await posService.closeShift(req.companyId, req.user.id, req.params.id, req.body);
  res.json(shift);
};

exports.currentShift = async (req, res) => {
  const shift = await posService.getOpenShift(req.companyId, req.user.id);
  res.json(shift);
};

exports.listShifts = async (req, res) => {
  const shifts = await posService.listShifts(req.companyId, req.query);
  const withNames = await Promise.all(shifts.map(async (s) => {
    const cashier = await User.findByPk(s.cashier_id, { attributes: ['id', 'name'] });
    const branch = s.branch_id ? await Branch.findByPk(s.branch_id, { attributes: ['id', 'name_en', 'name_ar'] }) : null;
    return { ...s.toJSON(), cashier, branch };
  }));
  res.json(withNames);
};

exports.createSale = async (req, res) => {
  const profile = await profileFor(req);
  if (!profile.hasAccess) return res.status(403).json({ message: 'You do not have POS access' });
  const invoice = await posService.createSale(req.companyId, req.user.id, profile, req.body);
  res.status(201).json(invoice);
};

exports.heldSales = async (req, res) => {
  const held = await posService.heldSales(req.companyId, req.user.id);
  res.json(held);
};

exports.voidSale = async (req, res) => {
  const profile = await profileFor(req);
  const result = await posService.voidSale(req.companyId, req.user.id, profile, req.params.id);
  res.json(result);
};

exports.salesHistory = async (req, res) => {
  const rows = await posService.salesHistory(req.companyId, req.query);
  res.json(rows);
};

exports.refundSale = async (req, res) => {
  const profile = await profileFor(req);
  const result = await posService.refundSale(req.companyId, req.user.id, profile, req.params.id, req.body || {});
  res.json(result);
};

// ---- Cashier permission management (company admin) ----

exports.listCashiers = async (req, res) => {
  const rows = await UserCompany.findAll({
    where: { company_id: req.companyId },
    include: [{ model: User, attributes: ['id', 'name', 'email'] }],
  });
  res.json(rows.map((r) => ({
    user_id: r.user_id,
    name: r.User?.name,
    email: r.User?.email,
    role: r.role,
    pos_role: r.pos_role,
    pos_permissions: r.pos_permissions || [],
  })));
};

exports.updateCashier = async (req, res) => {
  const row = await UserCompany.findOne({ where: { company_id: req.companyId, user_id: req.params.userId } });
  if (!row) return res.status(404).json({ message: 'This user is not assigned to this company' });

  const { pos_role, pos_permissions } = req.body;
  const patch = {};
  if (pos_role !== undefined) {
    if (!['none', 'cashier', 'operator'].includes(pos_role)) return res.status(400).json({ message: 'Invalid pos_role' });
    patch.pos_role = pos_role;
  }
  if (pos_permissions !== undefined) {
    if (!Array.isArray(pos_permissions) || pos_permissions.some((p) => !posService.POS_ACTIONS.includes(p))) {
      return res.status(400).json({ message: `pos_permissions must be a subset of: ${posService.POS_ACTIONS.join(', ')}` });
    }
    patch.pos_permissions = pos_permissions;
  }
  await row.update(patch);
  res.json({
    user_id: row.user_id,
    role: row.role,
    pos_role: row.pos_role,
    pos_permissions: row.pos_permissions || [],
  });
};
