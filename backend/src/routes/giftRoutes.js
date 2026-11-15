const router = require('express').Router();
const ctrl = require('../controllers/giftController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany, requireMinRole('accountant'));
router.get('/', ctrl.report);

module.exports = router;
