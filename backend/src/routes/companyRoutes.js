const router = require('express').Router();
const ctrl = require('../controllers/companyController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, withCategory } = require('../middleware/upload');

router.use(requireAuth);
router.get('/', ctrl.list);
router.post('/', requireRole('super_admin'), ctrl.create);
router.put('/:id', requireRole('super_admin'), ctrl.update);
router.delete('/:id', requireRole('super_admin'), ctrl.remove);
router.post(
  '/:id/logo',
  requireRole('super_admin'),
  (req, res, next) => { req.companyId = req.params.id; next(); }, // so the upload middleware files it under this company's own folder
  withCategory('logo'),
  upload.single('file'),
  ctrl.uploadLogo
);

module.exports = router;
