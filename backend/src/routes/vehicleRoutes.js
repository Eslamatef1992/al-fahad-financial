const router = require('express').Router();
const ctrl = require('../controllers/vehicleController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { upload, withCategory } = require('../middleware/upload');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/assign-driver', ctrl.assignDriver);
router.post('/:id/documents', withCategory('vehicle-documents'), upload.single('file'), ctrl.addDocument);
router.delete('/:id/documents/:docId', ctrl.removeDocument);
router.post('/:id/maintenance', ctrl.addMaintenance);
router.delete('/:id/maintenance/:recId', ctrl.removeMaintenance);

module.exports = router;
