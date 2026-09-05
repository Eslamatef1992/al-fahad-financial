const router = require('express').Router();
const ctrl = require('../controllers/damageController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

// Admin-only module, same trust level as POS cashier management and
// Financial Configuration — this is a super-admin/admin back-office tool,
// not something a regular cashier/operator touches.
router.use(requireAuth, requireCompany, requireMinRole('admin'));

router.get('/', ctrl.list);
router.get('/types', ctrl.types);
router.post('/', ctrl.create);
router.post('/:id/clear', ctrl.clear);
router.delete('/:id', ctrl.remove);

module.exports = router;
