const router = require('express').Router();
const ctrl = require('../controllers/auditLogController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

// Company-scoped admins can view their own company's log; super_admin sees all.
router.use(requireAuth, requireCompany, requireMinRole('admin'));
router.get('/', ctrl.list);

module.exports = router;
