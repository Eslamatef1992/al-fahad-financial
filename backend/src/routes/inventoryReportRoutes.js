const router = require('express').Router();
const ctrl = require('../controllers/inventoryReportController');
const { requireAuth, requireCompany } = require('../middleware/auth');

router.use(requireAuth, requireCompany);

router.get('/valuation', ctrl.valuation);
router.get('/valuation/pdf', ctrl.valuationPdf);
router.get('/valuation/excel', ctrl.valuationExcel);

router.get('/low-stock', ctrl.lowStock);
router.get('/low-stock/pdf', ctrl.lowStockPdf);
router.get('/low-stock/excel', ctrl.lowStockExcel);

router.get('/movement', ctrl.movement);
router.get('/movement/pdf', ctrl.movementPdf);
router.get('/movement/excel', ctrl.movementExcel);

router.get('/sold-by-client', ctrl.soldByClient);
router.get('/sold-by-client/pdf', ctrl.soldByClientPdf);
router.get('/sold-by-client/excel', ctrl.soldByClientExcel);

module.exports = router;
