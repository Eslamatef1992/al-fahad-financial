const router = require('express').Router();
const ctrl = require('../controllers/accountController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/tree', ctrl.tree);
router.get('/', ctrl.list);
router.post('/', requireMinRole('admin'), ctrl.create);
router.put('/:id', requireMinRole('admin'), ctrl.update);
router.delete('/:id', requireMinRole('admin'), ctrl.remove);

module.exports = router;
