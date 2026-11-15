const router = require('express').Router();
const ctrl = require('../controllers/salesTargetController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany, requireMinRole('admin'));
router.get('/', ctrl.list);
router.get('/performance', ctrl.performance);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
