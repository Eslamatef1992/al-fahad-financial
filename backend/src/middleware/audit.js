const { AuditLog } = require('../models');

const ACTION_BY_METHOD = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

// Infers a human-friendly action + resource type from the request path, e.g.
// POST /api/vouchers/:id/post -> action 'post', resource 'vouchers'
function inferAction(req) {
  // req.originalUrl is stable across the whole request lifecycle; req.path/req.url
  // get trimmed as Express descends into sub-routers, so we must not rely on those here.
  const pathOnly = req.originalUrl.split('?')[0];
  const segments = pathOnly.split('/').filter(Boolean); // ['api','vouchers', ':id', 'post']
  const last = segments[segments.length - 1];
  const knownVerbs = ['post', 'cancel', 'assign-driver', 'documents', 'maintenance', 'login', 'change-password'];
  if (knownVerbs.includes(last)) return { action: last, resource_type: segments[1] };
  return { action: ACTION_BY_METHOD[req.method] || 'other', resource_type: segments[1] };
}

// Records every mutating request that completed without error, for accountability.
// Registered globally; reads req.user lazily inside the 'finish' handler so it
// still sees the value set later by requireAuth in each router.
function auditLogger(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    if (!req.user) return; // unauthenticated mutations (e.g. login itself) are skipped
    const { action, resource_type } = inferAction(req);
    AuditLog.create({
      user_id: req.user.id,
      company_id: req.companyId || null,
      method: req.method,
      path: req.originalUrl,
      action,
      resource_type,
      status_code: res.statusCode,
      ip_address: req.ip,
    }).catch((err) => console.error('Audit log write failed:', err.message));
  });

  next();
}

module.exports = auditLogger;
