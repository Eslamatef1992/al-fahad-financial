const router = require('express').Router();
const ctrl = require('../controllers/voucherController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/excel', ctrl.exportExcel);
router.get('/:id', ctrl.get);
router.get('/:id/pdf', ctrl.pdf);
router.post('/', requireMinRole('accountant'), ctrl.create);
router.put('/:id', requireMinRole('accountant'), ctrl.update);
router.post('/:id/post', requireMinRole('accountant'), ctrl.post);
router.post('/:id/cancel', requireMinRole('admin'), ctrl.cancel);

module.exports = router;
