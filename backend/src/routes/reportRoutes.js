const router = require('express').Router();
const ctrl = require('../controllers/reportController');
const { requireAuth, requireCompany } = require('../middleware/auth');

router.use(requireAuth, requireCompany);
router.get('/profit-and-loss', ctrl.profitAndLoss);
router.get('/profit-and-loss/pdf', ctrl.profitAndLossPdf);
router.get('/balance-sheet', ctrl.balanceSheet);
router.get('/balance-sheet/pdf', ctrl.balanceSheetPdf);

module.exports = router;
