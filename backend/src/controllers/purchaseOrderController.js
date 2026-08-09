const { Op } = require('sequelize');
const { PurchaseOrder, PurchaseOrderLine, Supplier, CostCenter, Account, Item, Invoice, Company } = require('../models');
const purchaseOrderService = require('../services/purchaseOrderService');
const { generatePurchaseOrderPdf } = require('../services/pdfService');
const { exportPurchaseOrders } = require('../services/excelService');

const lineInclude = [{ model: PurchaseOrderLine, as: 'lines', include: [{ model: Account, as: 'account' }, { model: Item, as: 'item' }] }];
const partyInclude = [
  { model: Supplier, as: 'supplier' },
  { model: CostCenter, as: 'costCenter' },
  { model: Invoice, as: 'convertedInvoice', attributes: ['id', 'invoice_no', 'status'] },
];

exports.list = async (req, res) => {
  const { status, from, to, supplier_id } = req.query;
  const where = { company_id: req.companyId };
  if (status) where.status = status;
  if (supplier_id) where.supplier_id = supplier_id;
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };

  const rows = await PurchaseOrder.findAll({ where, include: partyInclude, order: [['date', 'DESC'], ['createdAt', 'DESC']] });
  res.json(rows);
};

exports.get = async (req, res) => {
  const po = await PurchaseOrder.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [...lineInclude, ...partyInclude],
  });
  if (!po) return res.status(404).json({ message: 'Purchase order not found' });
  res.json(po);
};

exports.create = async (req, res) => {
  const po = await purchaseOrderService.createPurchaseOrder(req.companyId, req.user.id, req.body);
  const withLines = await PurchaseOrder.findByPk(po.id, { include: [...lineInclude, ...partyInclude] });
  res.status(201).json(withLines);
};

exports.update = async (req, res) => {
  const po = await purchaseOrderService.updatePurchaseOrder(req.companyId, req.params.id, req.body);
  const withLines = await PurchaseOrder.findByPk(po.id, { include: [...lineInclude, ...partyInclude] });
  res.json(withLines);
};

exports.remove = async (req, res) => {
  await purchaseOrderService.removePurchaseOrder(req.companyId, req.params.id);
  res.json({ message: 'Purchase order deleted' });
};

exports.convert = async (req, res) => {
  const { invoice } = await purchaseOrderService.convertToPurchaseBill(req.companyId, req.params.id, req.user.id);
  const po = await PurchaseOrder.findByPk(req.params.id, { include: [...lineInclude, ...partyInclude] });
  res.json({ purchaseOrder: po, invoice });
};

exports.cancel = async (req, res) => {
  const po = await purchaseOrderService.cancelPurchaseOrder(req.companyId, req.params.id);
  res.json(po);
};

exports.pdf = async (req, res) => {
  const po = await PurchaseOrder.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: [...lineInclude, ...partyInclude] });
  if (!po) return res.status(404).json({ message: 'Purchase order not found' });
  const company = await Company.findByPk(req.companyId);
  generatePurchaseOrderPdf(res, po, company);
};

exports.exportExcel = async (req, res) => {
  const rows = await PurchaseOrder.findAll({ where: { company_id: req.companyId }, include: partyInclude, order: [['date', 'DESC']] });
  const company = await Company.findByPk(req.companyId);
  await exportPurchaseOrders(res, company, rows);
};
