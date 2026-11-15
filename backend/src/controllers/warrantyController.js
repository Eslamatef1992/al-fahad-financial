const warrantyService = require('../services/warrantyService');
const posService = require('../services/posService');
const { effectiveRole } = require('../middleware/permissions');

async function ctx(req) {
  const profile = await posService.getPosProfile(req.companyId, req.user.id, req.user.role === 'super_admin', effectiveRole(req));
  if (!profile.can('refund')) { const e = new Error('You are not permitted to process warranty claims / exchanges'); e.status = 403; throw e; }
  const shift = await posService.getOpenShift(req.companyId, req.user.id);
  return { isSuper: req.user.role === 'super_admin', shiftId: shift?.id || null };
}

exports.lookup = async (req, res) => res.json(await warrantyService.lookup(req.companyId, req.query));
exports.list = async (req, res) => res.json(await warrantyService.listClaims(req.companyId, req.query));
exports.create = async (req, res) => {
  const c = await ctx(req);
  const claim = await warrantyService.createClaim(req.companyId, req.user.id, req.body, c);
  res.status(201).json(claim);
};
