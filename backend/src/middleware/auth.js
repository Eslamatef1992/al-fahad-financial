const jwt = require('jsonwebtoken');
const { User, UserCompany } = require('../models');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Not authenticated' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(payload.sub);
    if (!user || !user.is_active) return res.status(401).json({ message: 'Not authenticated' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Resolves the active company from X-Company-Id header and verifies the user has access
async function requireCompany(req, res, next) {
  try {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ message: 'X-Company-Id header is required' });

    if (req.user.role === 'super_admin') {
      req.companyId = companyId;
      return next();
    }

    const access = await UserCompany.findOne({ where: { user_id: req.user.id, company_id: companyId } });
    if (!access) return res.status(403).json({ message: 'No access to this company' });

    req.companyId = companyId;
    req.companyRole = access.role;
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Company resolution failed' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireCompany, requireRole };
