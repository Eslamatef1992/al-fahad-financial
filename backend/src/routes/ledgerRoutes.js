const router = require('express').Router();
const ctrl = require('../controllers/ledgerController');
const { requireAuth, requireCompany } = require('../middleware/auth');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.query);
router.get('/excel', ctrl.exportExcel);
router.get('/trial-balance', ctrl.trialBalance);
router.get('/trial-balance/excel', ctrl.trialBalanceExcel);

module.exports = router;
