const router = require('express').Router();
const ctrl = require('../controllers/salesPersonController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list); // POS cashiers need the list for the dropdown
router.post('/', requireMinRole('admin'), ctrl.create);
router.put('/:id', requireMinRole('admin'), ctrl.update);

module.exports = router;
