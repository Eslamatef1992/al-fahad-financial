const router = require('express').Router();
const ctrl = require('../controllers/paymentMethodController');
const { requireAuth, requireCompany, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireCompany);
// Any authenticated company user can see the list (POS checkout, invoice
// payment forms need it) — only a super admin can define/change/retire one,
// since each entry decides which real GL account a payment posts into.
router.get('/', ctrl.list);
router.post('/', requireRole('super_admin'), ctrl.create);
router.put('/:id', requireRole('super_admin'), ctrl.update);
router.delete('/:id', requireRole('super_admin'), ctrl.remove);

module.exports = router;
