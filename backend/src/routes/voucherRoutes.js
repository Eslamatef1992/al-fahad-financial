const router = require('express').Router();
const ctrl = require('../controllers/voucherController');
const { requireAuth, requireCompany } = require('../middleware/auth');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/excel', ctrl.exportExcel);
router.get('/:id', ctrl.get);
router.get('/:id/pdf', ctrl.pdf);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.post('/:id/post', ctrl.post);
router.post('/:id/cancel', ctrl.cancel);

module.exports = router;
