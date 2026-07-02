const router = require('express').Router();
const ctrl = require('../controllers/clientController');
const { requireAuth, requireCompany } = require('../middleware/auth');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
