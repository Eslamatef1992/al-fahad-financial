const { RecurringInvoice, RecurringInvoiceLine, Client, Supplier, CostCenter, Account } = require('../models');
const recurringInvoiceService = require('../services/recurringInvoiceService');

const include = [
  { model: RecurringInvoiceLine, as: 'lines', include: [{ model: Account, as: 'account' }] },
  { model: Client, as: 'client' },
  { model: Supplier, as: 'supplier' },
  { model: CostCenter, as: 'costCenter' },
];

exports.list = async (req, res) => {
  const { type } = req.query;
  const where = { company_id: req.companyId };
  if (type) where.type = type;
  const templates = await RecurringInvoice.findAll({ where, include, order: [['name', 'ASC']] });
  res.json(templates);
};

exports.get = async (req, res) => {
  const template = await RecurringInvoice.findOne({ where: { id: req.params.id, company_id: req.companyId }, include });
  if (!template) return res.status(404).json({ message: 'Not found' });
  res.json(template);
};

exports.create = async (req, res) => {
  const template = await recurringInvoiceService.createTemplate(req.companyId, req.body);
  res.status(201).json(template);
};

exports.update = async (req, res) => {
  const template = await recurringInvoiceService.updateTemplate(req.companyId, req.params.id, req.body);
  res.json(template);
};

exports.remove = async (req, res) => {
  const template = await RecurringInvoice.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!template) return res.status(404).json({ message: 'Not found' });
  await template.update({ is_active: false });
  res.json({ message: 'Deactivated' });
};

exports.generateDue = async (req, res) => {
  const generated = await recurringInvoiceService.generateDueInvoices(req.companyId);
  res.json({ generated_count: generated.length, invoices: generated });
};
