const { Op } = require('sequelize');
const { Invoice, InvoiceLine, InvoicePayment, Client, Supplier, Account, CostCenter, Company, Voucher } = require('../models');
const invoiceService = require('../services/invoiceService');
const { generateInvoicePdf, generateAgingPdf } = require('../services/pdfService');
const { exportInvoices } = require('../services/excelService');

const lineInclude = [{ model: InvoiceLine, as: 'lines', include: [{ model: Account, as: 'account' }] }];
const partyInclude = [{ model: Client, as: 'client' }, { model: Supplier, as: 'supplier' }, { model: CostCenter, as: 'costCenter' }];
const paymentInclude = [{ model: InvoicePayment, as: 'payments', include: [{ model: Voucher, as: 'voucher', attributes: ['id', 'voucher_no', 'status'] }] }];

exports.list = async (req, res) => {
  const { type, status, from, to, party_id } = req.query;
  const where = { company_id: req.companyId };
  if (type) where.type = type;
  if (status) where.status = status;
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  if (party_id) where[Op.or] = [{ client_id: party_id }, { supplier_id: party_id }];

  const invoices = await Invoice.findAll({ where, include: partyInclude, order: [['date', 'DESC'], ['createdAt', 'DESC']] });
  res.json(invoices);
};

exports.get = async (req, res) => {
  const invoice = await Invoice.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [...lineInclude, ...partyInclude, ...paymentInclude],
  });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  res.json(invoice);
};

exports.create = async (req, res) => {
  const invoice = await invoiceService.createInvoice(req.companyId, req.user.id, req.body);
  res.status(201).json(invoice);
};

exports.update = async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  if (invoice.status !== 'draft') return res.status(400).json({ message: 'Only draft invoices can be edited' });

  await invoice.destroy();
  const recreated = await invoiceService.createInvoice(req.companyId, req.user.id, req.body);
  res.json(recreated);
};

exports.remove = async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  if (invoice.status !== 'draft') return res.status(400).json({ message: 'Only draft invoices can be deleted' });
  await invoice.destroy(); // InvoiceLine rows cascade-delete with it
  res.json({ message: 'Invoice deleted' });
};

exports.post = async (req, res) => {
  const invoice = await invoiceService.postInvoice(req.companyId, req.params.id, req.user.id);
  res.json(invoice);
};

exports.cancel = async (req, res) => {
  const invoice = await invoiceService.cancelInvoice(req.companyId, req.params.id);
  res.json(invoice);
};

exports.addPayment = async (req, res) => {
  const invoice = await invoiceService.recordPayment(req.companyId, req.params.id, req.user.id, req.body);
  const withPayments = await Invoice.findByPk(invoice.id, { include: [...lineInclude, ...partyInclude, ...paymentInclude] });
  res.status(201).json(withPayments);
};

exports.pdf = async (req, res) => {
  const invoice = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [...lineInclude, ...partyInclude] });
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
  const company = await Company.findByPk(req.companyId);
  generateInvoicePdf(res, invoice, company);
};

exports.exportExcel = async (req, res) => {
  const { type, status, from, to } = req.query;
  const where = { company_id: req.companyId, type: type || 'sales' };
  if (status) where.status = status;
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };

  const invoices = await Invoice.findAll({ where, include: partyInclude, order: [['date', 'DESC']] });
  const company = await Company.findByPk(req.companyId);
  await exportInvoices(res, company, invoices, type || 'sales');
};

// AR/AP aging: outstanding balance per party, bucketed by days overdue
async function computeAging(companyId, type) {
  const invoiceType = type === 'purchase' ? 'purchase' : 'sales';
  const today = new Date();

  const invoices = await Invoice.findAll({
    where: { company_id: companyId, type: invoiceType, status: { [Op.in]: ['posted', 'partially_paid'] } },
    include: partyInclude,
  });

  const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const rows = invoices.map((inv) => {
    const outstanding = Number(inv.total) - Number(inv.paid_total);
    const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.date);
    const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
    let bucket = 'current';
    if (daysOverdue > 90) bucket = '90+';
    else if (daysOverdue > 60) bucket = '61-90';
    else if (daysOverdue > 30) bucket = '31-60';
    else if (daysOverdue > 0) bucket = '1-30';
    buckets[bucket] += outstanding;

    return {
      invoice_no: inv.invoice_no,
      party: invoiceType === 'sales' ? inv.client?.name_en : inv.supplier?.name_en,
      date: inv.date,
      due_date: inv.due_date,
      total: Number(inv.total),
      paid: Number(inv.paid_total),
      outstanding,
      days_overdue: Math.max(daysOverdue, 0),
      bucket,
    };
  }).filter((r) => r.outstanding > 0.001);

  return { type: invoiceType, as_of: today.toISOString().slice(0, 10), rows, buckets, total_outstanding: Object.values(buckets).reduce((s, v) => s + v, 0) };
}

exports.aging = async (req, res) => {
  const aging = await computeAging(req.companyId, req.query.type);
  res.json(aging);
};

exports.agingPdf = async (req, res) => {
  const aging = await computeAging(req.companyId, req.query.type);
  const company = await Company.findByPk(req.companyId);
  generateAgingPdf(res, aging, company);
};
