const router = require('express').Router();
const ctrl = require('../controllers/posAuthController');

// Public (no token): used by the pos.<domain> sign-in page.
router.get('/branches', ctrl.branches);
router.get('/salespeople', ctrl.salespeople);
router.post('/login', ctrl.login);
router.post('/branch-login', ctrl.branchLogin);

module.exports = router;
