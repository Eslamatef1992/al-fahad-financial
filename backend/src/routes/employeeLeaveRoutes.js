const router = require('express').Router();
const ctrl = require('../controllers/employeeLeaveController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.post('/', requireMinRole('accountant'), ctrl.create);
router.delete('/:id', requireMinRole('admin'), ctrl.remove);

module.exports = router;
