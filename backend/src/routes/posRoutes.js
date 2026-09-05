const router = require('express').Router();
const ctrl = require('../controllers/posController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);

router.get('/me', ctrl.myAccess);
router.get('/shift/current', ctrl.currentShift);
router.post('/shift/open', ctrl.openShift);
router.post('/shift/:id/close', ctrl.closeShift);
router.get('/shifts', requireMinRole('admin'), ctrl.listShifts);

router.post('/sales', ctrl.createSale);
router.get('/sales/held', ctrl.heldSales);
router.post('/sales/:id/void', ctrl.voidSale);

router.get('/cashiers', requireMinRole('admin'), ctrl.listCashiers);
router.put('/cashiers/:userId', requireMinRole('admin'), ctrl.updateCashier);

module.exports = router;
