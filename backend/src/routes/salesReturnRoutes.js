const router = require('express').Router();
const ctrl = require('../controllers/salesReturnController');
const { requireAuth, requireCompany } = require('../middleware/auth');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/for-invoice/:invoiceId', ctrl.returnable);
router.get('/:id', ctrl.get);
router.post('/', ctrl.create);

module.exports = router;
