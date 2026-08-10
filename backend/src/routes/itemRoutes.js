const router = require('express').Router();
const ctrl = require('../controllers/itemController');
const { requireAuth, requireCompany } = require('../middleware/auth');
const { requireMinRole } = require('../middleware/permissions');
const { upload, withCategory } = require('../middleware/upload');

router.use(requireAuth, requireCompany);
router.get('/', ctrl.list);
router.get('/excel', ctrl.exportExcel);
router.get('/pdf', ctrl.pdf);
router.get('/:id', ctrl.get);
router.get('/:id/transactions', ctrl.transactions);
router.get('/:id/stock', ctrl.stockByBranch);
router.get('/:id/variants', ctrl.listVariants);
router.get('/:id/variants/pdf', ctrl.variantsPdf);
router.get('/:id/variants/excel', ctrl.variantsExcel);
router.post('/', requireMinRole('accountant'), ctrl.create);
router.put('/:id', requireMinRole('accountant'), ctrl.update);
router.post('/:id/image', requireMinRole('accountant'), withCategory('item-images'), upload.single('file'), ctrl.uploadImage);
router.delete('/:id/image', requireMinRole('accountant'), ctrl.removeImage);
router.post('/:id/variants', requireMinRole('accountant'), ctrl.createVariant);
router.put('/:id/variants/:variantId', requireMinRole('accountant'), ctrl.updateVariant);
router.delete('/:id/variants/:variantId', requireMinRole('admin'), ctrl.removeVariant);
router.post('/:id/adjust', requireMinRole('admin'), ctrl.adjustStock);
router.delete('/:id', requireMinRole('admin'), ctrl.remove);

module.exports = router;
