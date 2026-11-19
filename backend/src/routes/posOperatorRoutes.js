const router = require('express').Router();
const ctrl = require('../controllers/posOperatorController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany, requireMinRole('admin'));
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/branches/:branchId/password', ctrl.setBranchPassword);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
