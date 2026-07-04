const { Voucher, VoucherLine, Account, CostCenter, Client, Supplier, Company } = require('../models');
const voucherService = require('../services/voucherService');
const { generateVoucherPdf } = require('../services/pdfService');
const { exportVouchers } = require('../services/excelService');

const lineInclude = [
  { model: Account, as: 'account' },
  { model: CostCenter, as: 'costCenter' },
  { model: Client, as: 'client' },
  { model: Supplier, as: 'supplier' },
];

exports.list = async (req, res) => {
  const { type, status, from, to } = req.query;
  const where = { company_id: req.companyId };
  if (type) where.voucher_type = type;
  if (status) where.status = status;
  const { Op } = require('sequelize');
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };

  const vouchers = await Voucher.findAll({ where, order: [['date', 'DESC'], ['createdAt', 'DESC']] });
  res.json(vouchers);
};

exports.get = async (req, res) => {
  const voucher = await Voucher.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [{ model: VoucherLine, as: 'lines', include: lineInclude }],
  });
  if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
  res.json(voucher);
};

exports.create = async (req, res) => {
  const voucher = await voucherService.createVoucher(req.companyId, req.user.id, req.body);
  res.status(201).json(voucher);
};

exports.update = async (req, res) => {
  const voucher = await Voucher.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
  if (voucher.status !== 'draft') return res.status(400).json({ message: 'Only draft vouchers can be edited' });

  await voucher.destroy();
  const recreated = await voucherService.createVoucher(req.companyId, req.user.id, req.body);
  res.json(recreated);
};

exports.exportExcel = async (req, res) => {
  const { type, status, from, to } = req.query;
  const where = { company_id: req.companyId };
  if (type) where.voucher_type = type;
  if (status) where.status = status;
  const { Op } = require('sequelize');
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };

  const vouchers = await Voucher.findAll({ where, order: [['date', 'DESC']] });
  const company = await Company.findByPk(req.companyId);
  await exportVouchers(res, company, vouchers);
};

exports.pdf = async (req, res) => {
  const voucher = await Voucher.findOne({
    where: { id: req.params.id, company_id: req.companyId },
    include: [{ model: VoucherLine, as: 'lines', include: [{ model: Account, as: 'account' }, { model: CostCenter, as: 'costCenter' }] }],
  });
  if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
  const company = await Company.findByPk(req.companyId);
  generateVoucherPdf(res, voucher, company);
};

// Draft vouchers (never posted, so no ledger entries exist yet) can be deleted outright.
// Posted vouchers must go through cancel() instead, which preserves history via a
// reversing entry rather than removing anything.
exports.remove = async (req, res) => {
  const voucher = await Voucher.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!voucher) return res.status(404).json({ message: 'Voucher not found' });
  if (voucher.status !== 'draft') return res.status(400).json({ message: 'Only draft vouchers can be deleted — cancel a posted voucher instead' });
  await voucher.destroy();
  res.json({ message: 'Voucher deleted' });
};

exports.post = async (req, res) => {
  const voucher = await voucherService.postVoucher(req.companyId, req.params.id);
  res.json(voucher);
};

exports.cancel = async (req, res) => {
  const voucher = await voucherService.cancelVoucher(req.companyId, req.params.id);
  res.json(voucher);
};
