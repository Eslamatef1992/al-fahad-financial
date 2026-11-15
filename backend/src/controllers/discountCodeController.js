const { Op } = require('sequelize');
const { DiscountCode, Item, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const discountService = require('../services/discountService');

function badRequest(res, message) { return res.status(400).json({ message }); }

async function cleanItems(req) {
  const ids = Array.isArray(req.body.item_ids) ? [...new Set(req.body.item_ids.filter(Boolean))] : [];
  if (ids.length) {
    const n = await Item.count({ where: { company_id: req.companyId, id: { [Op.in]: ids } } });
    if (n !== ids.length) return { error: 'One of the selected items does not exist' };
  }
  return { ids };
}

// Coupon tracking: every redemption (invoice level or per item line), what it cost
// in discount, and the resulting sales — per code and in total.
exports.tracking = async (req, res) => {
  const { from, to } = req.query;
  const rep = { c: req.companyId, from: from || '1900-01-01', to: to || '2999-12-31' };
  const rows = await sequelize.query(`
    SELECT x.code_id, x.invoice_id, x.invoice_no, x.date, x.total, x.status, x.discount, x.client_name, x.salesperson, x.channel FROM (
      SELECT i.discount_code_id AS code_id, i.id AS invoice_id, i.invoice_no, i.date, i.total, i.status, i.discount_amount AS discount,
             cl.name_en AS client_name, sp.name_en AS salesperson, i.channel
        FROM invoices i LEFT JOIN clients cl ON cl.id = i.client_id LEFT JOIN sales_people sp ON sp.id = i.salesperson_id
       WHERE i.company_id = :c AND i.discount_code_id IS NOT NULL AND i.date BETWEEN :from AND :to
      UNION ALL
      SELECT l.discount_code_id, i.id, i.invoice_no, i.date, i.total, i.status, SUM(l.discount_amount),
             cl.name_en, sp.name_en, i.channel
        FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
        LEFT JOIN clients cl ON cl.id = i.client_id LEFT JOIN sales_people sp ON sp.id = i.salesperson_id
       WHERE i.company_id = :c AND l.discount_code_id IS NOT NULL AND i.date BETWEEN :from AND :to
       GROUP BY l.discount_code_id, i.id, i.invoice_no, i.date, i.total, i.status, cl.name_en, sp.name_en, i.channel
    ) x ORDER BY x.date DESC`, { replacements: rep, type: QueryTypes.SELECT });
  const codes = await DiscountCode.findAll({ where: { company_id: req.companyId } });
  const today = new Date().toISOString().slice(0, 10);
  const out = codes.map((c) => {
    const uses = rows.filter((r) => r.code_id === c.id && r.status !== 'cancelled');
    const max = c.single_use ? 1 : c.max_redemptions;
    return {
      id: c.id, code: c.code, type: c.type, value: Number(c.value), scope: c.scope, single_use: !!c.single_use, item_ids: c.item_ids || [],
      expiry_date: c.expiry_date, expired: !!(c.expiry_date && c.expiry_date < today), is_active: c.is_active,
      max_redemptions: max, redemptions: uses.length, remaining: max == null ? null : Math.max(0, max - uses.length),
      total_discount: uses.reduce((s, r) => s + Number(r.discount || 0), 0),
      sales_after_discount: uses.reduce((s, r) => s + Number(r.total || 0), 0),
      invoices: uses.map((r) => ({ invoice_id: r.invoice_id, invoice_no: r.invoice_no, date: r.date, total: Number(r.total), discount: Number(r.discount), client: r.client_name, salesperson: r.salesperson, channel: r.channel })),
    };
  });
  res.json({
    codes: out,
    totals: { redemptions: out.reduce((s, c) => s + c.redemptions, 0), discount: out.reduce((s, c) => s + c.total_discount, 0), sales: out.reduce((s, c) => s + c.sales_after_discount, 0) },
  });
};

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
  const { code, description, type, value, expiry_date, max_redemptions, min_invoice_amount } = req.body;
  let { scope } = req.body;
  const picked = await cleanItems(req);
  if (picked.error) return badRequest(res, picked.error);
  if (picked.ids.length) scope = 'line'; // a per-item coupon can only work on item lines
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
    single_use: !!req.body.single_use,
    item_ids: picked.ids,
  });
  res.status(201).json(created);
};

exports.update = async (req, res) => {
  const dc = await DiscountCode.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!dc) return res.status(404).json({ message: 'Discount code not found' });

  const { code, description, type, value, expiry_date, max_redemptions, min_invoice_amount, is_active } = req.body;
  let { scope } = req.body;
  const picked = req.body.item_ids !== undefined ? await cleanItems(req) : null;
  if (picked?.error) return badRequest(res, picked.error);
  if (picked?.ids.length) scope = 'line';
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
    single_use: req.body.single_use !== undefined ? !!req.body.single_use : dc.single_use,
    item_ids: picked ? picked.ids : dc.item_ids,
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
  const result = await discountService.previewDiscount(req.companyId, code, Number(base_amount || 0), scope, req.body.item_id);
  res.json(result);
};
