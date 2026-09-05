const router = require('express').Router();
const ctrl = require('../controllers/financialSettingController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.get);
router.put('/', requireMinRole('admin'), ctrl.update);

module.exports = router;
