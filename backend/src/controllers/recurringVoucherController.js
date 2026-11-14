const { RecurringVoucher } = require('../models');
const svc = require('../services/recurringVoucherService');

exports.list = async (req, res) => {
  res.json(await RecurringVoucher.findAll({ where: { company_id: req.companyId }, order: [['name', 'ASC']] }));
};
exports.get = async (req, res) => {
  const t = await RecurringVoucher.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!t) return res.status(404).json({ message: 'Not found' });
  res.json(t);
};
exports.create = async (req, res) => { res.status(201).json(await svc.createTemplate(req.companyId, req.body)); };
exports.update = async (req, res) => { res.json(await svc.updateTemplate(req.companyId, req.params.id, req.body)); };
exports.remove = async (req, res) => {
  const t = await RecurringVoucher.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!t) return res.status(404).json({ message: 'Not found' });
  await t.update({ is_active: false });
  res.json({ message: 'Deactivated' });
};
exports.generateDue = async (req, res) => {
  const generated = await svc.generateDueVouchers(req.companyId);
  res.json({ generated_count: generated.length, vouchers: generated });
};
