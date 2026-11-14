const router = require('express').Router();
const ctrl = require('../controllers/manufactureCatalogController');
const { requireAuth, requireCompany, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireCompany);
// Any company user can read the catalog (the POS needs it); only a super admin
// maintains it, since it carries the manufacturer cost prices.
router.get('/categories', ctrl.listCategories);
router.post('/categories', requireRole('super_admin'), ctrl.createCategory);
router.put('/categories/:id', requireRole('super_admin'), ctrl.updateCategory);
router.get('/items', ctrl.listItems);
router.post('/items', requireRole('super_admin'), ctrl.createItem);
router.put('/items/:id', requireRole('super_admin'), ctrl.updateItem);

module.exports = router;
