const router = require('express').Router();
const ctrl = require('../controllers/recurringInvoiceController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', requireMinRole('admin'), ctrl.create);
router.put('/:id', requireMinRole('admin'), ctrl.update);
router.delete('/:id', requireMinRole('admin'), ctrl.remove);
router.post('/generate-due', requireMinRole('accountant'), ctrl.generateDue);

module.exports = router;
