const router = require('express').Router();
const ctrl = require('../controllers/cashAccountController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/excel', ctrl.exportExcel);
router.get('/pdf', ctrl.pdf);
router.get('/:id', ctrl.get);
router.post('/', requireMinRole('accountant'), ctrl.create);
router.put('/:id', requireMinRole('accountant'), ctrl.update);
router.delete('/:id', requireMinRole('admin'), ctrl.remove);

module.exports = router;
