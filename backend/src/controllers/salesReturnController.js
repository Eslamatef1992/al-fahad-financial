const salesReturnService = require('../services/salesReturnService');
const posService = require('../services/posService');
const { effectiveRole } = require('../middleware/permissions');

// Accountants/admins, and POS staff holding the "refund" permission, may process returns.
async function assertCanRefund(req) {
  const profile = await posService.getPosProfile(req.companyId, req.user.id, req.user.role === 'super_admin', effectiveRole(req));
  if (!profile.can('refund')) { const e = new Error('You are not permitted to process returns/refunds'); e.status = 403; throw e; }
}

exports.list = async (req, res) => res.json(await salesReturnService.listReturns(req.companyId, req.query));
exports.get = async (req, res) => {
  const ret = await salesReturnService.getReturn(req.companyId, req.params.id);
  const { amountInWordsAr, amountInWordsEn } = require('../services/numberToWords');
  const data = ret.toJSON();
  data.amount_in_words_ar = amountInWordsAr(Number(ret.total), ret.invoice?.currency || 'KWD');
  data.amount_in_words_en = amountInWordsEn(Number(ret.total), ret.invoice?.currency || 'KWD');
  res.json(data);
};
exports.returnable = async (req, res) => res.json(await salesReturnService.returnable(req.companyId, req.params.invoiceId));

exports.confirmStock = async (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ message: 'Only the super admin can confirm returned stock' });
  await salesReturnService.confirmStock(req.companyId, req.user.id, req.params.id, req.body?.dispositions);
  res.json(await salesReturnService.getReturn(req.companyId, req.params.id));
};

exports.create = async (req, res) => {
  await assertCanRefund(req);
  const shift = await posService.getOpenShift(req.companyId, req.user.id);
  const ret = await salesReturnService.createReturn(req.companyId, req.user.id, { ...req.body, pos_shift_id: shift?.id || null, auto_confirm: req.user.role === 'super_admin' });
  res.status(201).json(await salesReturnService.getReturn(req.companyId, ret.id));
};
