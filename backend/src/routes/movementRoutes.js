const router = require('express').Router();
const ctrl = require('../controllers/movementController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/search', ctrl.search);
router.get('/invoice/:id', ctrl.invoice);                       // POS operators can follow a single invoice
router.get('/client/:clientId', requireMinRole('accountant'), ctrl.client); // whole-client view: super admin / accounts
module.exports = router;
