const router = require('express').Router();
const ctrl = require('../controllers/vehicleController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');
const { upload, withCategory } = require('../middleware/upload');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', requireMinRole('accountant'), ctrl.create);
router.put('/:id', requireMinRole('accountant'), ctrl.update);
router.delete('/:id', requireMinRole('admin'), ctrl.remove);
router.post('/:id/assign-driver', requireMinRole('accountant'), ctrl.assignDriver);
router.post('/:id/documents', requireMinRole('accountant'), withCategory('vehicle-documents'), upload.single('file'), ctrl.addDocument);
router.delete('/:id/documents/:docId', requireMinRole('admin'), ctrl.removeDocument);
router.post('/:id/maintenance', requireMinRole('accountant'), ctrl.addMaintenance);
router.delete('/:id/maintenance/:recId', requireMinRole('admin'), ctrl.removeMaintenance);

module.exports = router;
