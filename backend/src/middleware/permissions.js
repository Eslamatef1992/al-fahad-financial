// Role-based permission rules.
// - viewer: read-only
// - accountant: create/edit operational records + post/cancel vouchers, no deletes,
//   no structural changes (chart of accounts / cost centers)
// - admin: everything within their assigned companies, including deletes and
//   structural changes
// - super_admin (global User.role): treated as "admin" everywhere, plus the only
//   role allowed to manage Users and Companies themselves.
const RANK = { viewer: 1, accountant: 2, admin: 3 };

function effectiveRole(req) {
  if (req.user?.role === 'super_admin') return 'admin';
  return req.companyRole || 'viewer';
}

function requireMinRole(minRole) {
  return (req, res, next) => {
    const role = effectiveRole(req);
    if ((RANK[role] || 0) < RANK[minRole]) {
      return res.status(403).json({ message: `This action requires the '${minRole}' role or higher.` });
    }
    next();
  };
}

module.exports = { effectiveRole, requireMinRole };
