const { Op } = require('sequelize');
const { DiscountCode } = require('../models');
const discountService = require('../services/discountService');

function badRequest(res, message) { return res.status(400).json({ message }); }

exports.list = async (req, res) => {
  const { status } = req.query;
  const where = { company_id: req.companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  const codes = await DiscountCode.findAll({ where, order: [['createdAt', 'DESC']] });

  // Attach a live usage count to each code so the list can show "3 / 10
  // used" without a separate round trip per row.
  const withUsage = await Promise.all(codes.map(async (c) => ({
    ...c.toJSON(),
    used_count: await discountService.usageCount(req.companyId, c.id, null, null),
  })));
  res.json(withUsage);
};

exports.create = async (req, res) => {
  const { code, description, type, value, scope, expiry_date, max_redemptions, min_invoice_amount } = req.body;
  if (!code) return badRequest(res, 'code is required');
  if (!['percentage', 'fixed'].includes(type)) return badRequest(res, 'type must be "percentage" or "fixed"');
  if (!['invoice', 'line'].includes(scope)) return badRequest(res, 'scope must be "invoice" or "line"');
  if (value == null || Number(value) <= 0) return badRequest(res, 'value must be greater than 0');
  if (type === 'percentage' && Number(value) > 100) return badRequest(res, 'A percentage discount cannot exceed 100');

  const existing = await DiscountCode.findOne({ where: { company_id: req.companyId, code: { [Op.iLike]: code.trim() } } });
  if (existing) return badRequest(res, `Code "${code}" already exists`);

  const created = await DiscountCode.create({
    company_id: req.companyId,
    code: code.trim().toUpperCase(),
    description: description || null,
    type,
    value,
    scope,
    expiry_date: expiry_date || null,
    max_redemptions: max_redemptions || null,
    min_invoice_amount: min_invoice_amount || null,
  });
  res.status(201).json(created);
};

exports.update = async (req, res) => {
  const dc = await DiscountCode.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!dc) return res.status(404).json({ message: 'Discount code not found' });

  const { code, description, type, value, scope, expiry_date, max_redemptions, min_invoice_amount, is_active } = req.body;
  if (type && !['percentage', 'fixed'].includes(type)) return badRequest(res, 'type must be "percentage" or "fixed"');
  if (scope && !['invoice', 'line'].includes(scope)) return badRequest(res, 'scope must be "invoice" or "line"');
  if (value != null && Number(value) <= 0) return badRequest(res, 'value must be greater than 0');

  if (code && code.trim().toUpperCase() !== dc.code) {
    const existing = await DiscountCode.findOne({ where: { company_id: req.companyId, code: { [Op.iLike]: code.trim() }, id: { [Op.ne]: dc.id } } });
    if (existing) return badRequest(res, `Code "${code}" already exists`);
  }

  await dc.update({
    code: code ? code.trim().toUpperCase() : dc.code,
    description: description !== undefined ? description : dc.description,
    type: type || dc.type,
    value: value != null ? value : dc.value,
    scope: scope || dc.scope,
    expiry_date: expiry_date !== undefined ? (expiry_date || null) : dc.expiry_date,
    max_redemptions: max_redemptions !== undefined ? (max_redemptions || null) : dc.max_redemptions,
    min_invoice_amount: min_invoice_amount !== undefined ? (min_invoice_amount || null) : dc.min_invoice_amount,
    is_active: is_active !== undefined ? is_active : dc.is_active,
  });
  res.json(dc);
};

exports.remove = async (req, res) => {
  const dc = await DiscountCode.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!dc) return res.status(404).json({ message: 'Discount code not found' });
  await dc.update({ is_active: false });
  res.json({ message: 'Discount code deactivated' });
};

// Lets the invoice form show the resulting discount amount (and any
// validation error) before the invoice is actually saved.
exports.preview = async (req, res) => {
  const { code, base_amount, scope } = req.body;
  if (!code) return badRequest(res, 'code is required');
  const result = await discountService.previewDiscount(req.companyId, code, Number(base_amount || 0), scope);
  res.json(result);
};
