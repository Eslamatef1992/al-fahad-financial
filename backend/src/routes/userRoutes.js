const router = require('express').Router();
const ctrl = require('../controllers/userController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('super_admin'));
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.put('/:id/password', ctrl.resetPassword);
router.post('/:id/companies', ctrl.assignCompany);
router.delete('/:id/companies/:companyId', ctrl.removeCompany);

module.exports = router;
