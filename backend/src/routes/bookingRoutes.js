const router = require('express').Router();
const ctrl = require('../controllers/bookingController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.post('/:id/fulfill', requireMinRole('accountant'), ctrl.fulfill);
router.post('/:id/cancel', requireMinRole('accountant'), ctrl.cancel);

module.exports = router;
