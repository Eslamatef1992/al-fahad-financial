const router = require('express').Router();
const ctrl = require('../controllers/accountController');
const { requireAuth, requireCompany } = require('../middleware/auth');

router.use(requireAuth, requireCompany);
router.get('/tree', ctrl.tree);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
