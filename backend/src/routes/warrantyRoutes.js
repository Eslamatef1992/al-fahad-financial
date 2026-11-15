const router = require('express').Router();
const ctrl = require('../controllers/warrantyController');
const { requireAuth, requireCompany } = require('../middleware/auth');

router.use(requireAuth, requireCompany);
router.get('/lookup', ctrl.lookup);
router.get('/claims', ctrl.list);
router.post('/claims', ctrl.create);

module.exports = router;
