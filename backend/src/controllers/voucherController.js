const { sequelize, Voucher, VoucherLine, Account, CostCenter, Client, Supplier, Company } = require('../models');
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

// Edits a draft voucher IN PLACE — same id, same voucher_no (unless the type
// changes, in which case a fresh number for the new type is assigned). This
// used to destroy() the row and recreate it via createVoucher(), which handed
// out a brand new id on every edit; that broke any reference to the old id and
// made saving the same edit form twice (double-click, stale tab, browser back
// then re-save) 404 with "Voucher not found" once the first save had already
// replaced the row out from under the second request.
exports.update = async (req, res) => {
  const { voucher_type, date, description, cost_center_id, currency, lines } = req.body;

  if (!Array.isArray(lines) || lines.length < 2) {
    return res.status(400).json({ message: 'A voucher requires at least two lines' });
  }
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    return res.status(400).json({ message: `Voucher is not balanced: debit ${totalDebit} vs credit ${totalCredit}` });
  }

  const updated = await sequelize.transaction(async (t) => {
    const voucher = await Voucher.findOne({
      where: { id: req.params.id, company_id: req.companyId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!voucher) { const e = new Error('Voucher not found'); e.status = 404; throw e; }
    if (voucher.status !== 'draft') { const e = new Error('Only draft vouchers can be edited'); e.status = 400; throw e; }

    const newType = voucher_type || voucher.voucher_type;
    const voucher_no = newType !== voucher.voucher_type
      ? await voucherService.nextVoucherNo(req.companyId, newType)
      : voucher.voucher_no;

    await voucher.update({
      voucher_type: newType,
      voucher_no,
      date,
      description,
      cost_center_id: cost_center_id || null,
      currency: currency || voucher.currency,
      total_debit: totalDebit,
      total_credit: totalCredit,
    }, { transaction: t });

    await VoucherLine.destroy({ where: { voucher_id: voucher.id }, transaction: t });
    await Promise.all(lines.map((l, idx) => VoucherLine.create({
      voucher_id: voucher.id,
      account_id: l.account_id,
      cost_center_id: l.cost_center_id || cost_center_id || null,
      client_id: l.client_id || null,
      supplier_id: l.supplier_id || null,
      debit: l.debit || 0,
      credit: l.credit || 0,
      description: l.description || '',
      line_order: idx,
    }, { transaction: t })));

    return voucher;
  });

  res.json(updated);
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
