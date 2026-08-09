const router = require('express').Router();
const ctrl = require('../controllers/stockTransferController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/pdf', ctrl.pdf);
router.get('/excel', ctrl.exportExcel);
router.get('/:id', ctrl.get);
router.post('/', requireMinRole('accountant'), ctrl.create);

module.exports = router;
