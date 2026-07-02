const router = require('express').Router();
const ctrl = require('../controllers/companyController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', ctrl.list);
router.post('/', requireRole('super_admin'), ctrl.create);
router.put('/:id', requireRole('super_admin'), ctrl.update);
router.delete('/:id', requireRole('super_admin'), ctrl.remove);

module.exports = router;
