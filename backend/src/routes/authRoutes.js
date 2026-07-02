const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.post('/login', ctrl.login);
router.get('/me', requireAuth, ctrl.me);
router.post('/register', requireAuth, requireRole('super_admin', 'admin'), ctrl.register);
router.put('/change-password', requireAuth, ctrl.changePassword);

module.exports = router;
