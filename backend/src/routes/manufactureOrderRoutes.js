const router = require('express').Router();
const ctrl = require('../controllers/manufactureOrderController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.put('/:id', requireMinRole('accountant'), ctrl.update);

module.exports = router;
