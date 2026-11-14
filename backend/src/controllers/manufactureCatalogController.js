const { ManufactureCategory, ManufactureItem, Manufacturer } = require('../models');

function bad(res, message) { return res.status(400).json({ message }); }
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

async function nextCode(companyId) {
  const count = await ManufactureItem.count({ where: { company_id: companyId } });
  return `MI-${String(count + 1).padStart(5, '0')}`;
}

// ---- Categories ----
exports.listCategories = async (req, res) => {
  const where = { company_id: req.companyId };
  if (req.query.status !== 'all') where.is_active = true;
  res.json(await ManufactureCategory.findAll({ where, order: [['sort_order', 'ASC'], ['name_en', 'ASC']] }));
};
exports.createCategory = async (req, res) => {
  const { name_en, name_ar, sort_order } = req.body;
  if (!name_en || !String(name_en).trim()) return bad(res, 'name_en is required');
  const dup = await ManufactureCategory.findOne({ where: { company_id: req.companyId, name_en: String(name_en).trim() } });
  if (dup) return bad(res, 'A category with this name already exists');
  const row = await ManufactureCategory.create({
    company_id: req.companyId, name_en: String(name_en).trim(), name_ar: String(name_ar || name_en).trim(), sort_order: parseInt(sort_order, 10) || 0,
  });
  res.status(201).json(row);
};
exports.updateCategory = async (req, res) => {
  const row = await ManufactureCategory.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!row) return res.status(404).json({ message: 'Category not found' });
  const { name_en, name_ar, sort_order, is_active } = req.body;
  await row.update({
    ...(name_en !== undefined && { name_en: String(name_en).trim() }),
    ...(name_ar !== undefined && { name_ar: String(name_ar).trim() }),
    ...(sort_order !== undefined && { sort_order: parseInt(sort_order, 10) || 0 }),
    ...(is_active !== undefined && { is_active: !!is_active }),
  });
  res.json(row);
};

// ---- Items ----
exports.listItems = async (req, res) => {
  const where = { company_id: req.companyId };
  if (req.query.status !== 'all') where.is_active = true;
  if (req.query.category_id) where.category_id = req.query.category_id;
  res.json(await ManufactureItem.findAll({ where, order: [['code', 'ASC']] }));
};

async function validate(req, body, existing) {
  const out = {};
  const pick = (k) => body[k] !== undefined;
  if (!existing || pick('category_id')) {
    const cat = await ManufactureCategory.findOne({ where: { id: body.category_id, company_id: req.companyId } });
    if (!cat) return { error: 'Choose a valid category' };
    out.category_id = cat.id;
  }
  if (!existing || pick('name_en')) {
    if (!body.name_en || !String(body.name_en).trim()) return { error: 'name_en is required' };
    out.name_en = String(body.name_en).trim();
  }
  if (!existing || pick('name_ar')) out.name_ar = String(body.name_ar || body.name_en || existing?.name_en || '').trim();
  ['color', 'size', 'dimension_unit'].forEach((k) => { if (pick(k)) out[k] = String(body[k] ?? '').trim() || (k === 'dimension_unit' ? 'cm' : null); });
  ['height', 'length'].forEach((k) => { if (pick(k)) { const v = num(body[k]); if (v !== null && (!Number.isFinite(v) || v < 0)) out.__bad = k; else out[k] = v; } });
  ['selling_price', 'manufacturer_cost_price'].forEach((k) => {
    if (pick(k)) { const v = Number(body[k] || 0); if (!Number.isFinite(v) || v < 0) out.__bad = k; else out[k] = v; }
  });
  if (out.__bad) return { error: `${out.__bad} must be a non-negative number` };
  if (pick('manufacturer_id')) {
    if (body.manufacturer_id) {
      const m = await Manufacturer.findOne({ where: { id: body.manufacturer_id, company_id: req.companyId } });
      if (!m) return { error: 'Unknown manufacturer' };
      out.manufacturer_id = m.id;
    } else out.manufacturer_id = null;
  }
  if (pick('is_active')) out.is_active = !!body.is_active;
  return { out };
}

exports.createItem = async (req, res) => {
  const { out, error } = await validate(req, req.body, null);
  if (error) return bad(res, error);
  const row = await ManufactureItem.create({ ...out, company_id: req.companyId, code: await nextCode(req.companyId) });
  res.status(201).json(row);
};
exports.updateItem = async (req, res) => {
  const row = await ManufactureItem.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!row) return res.status(404).json({ message: 'Item not found' });
  const { out, error } = await validate(req, req.body, row);
  if (error) return bad(res, error);
  await row.update(out);
  res.json(row);
};
