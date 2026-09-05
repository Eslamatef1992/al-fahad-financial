const { Unit } = require('../models');

const withBase = [{ model: Unit, as: 'baseUnit' }];

// Same starter set the Item form used to hardcode as free-text options —
// seeded once per company (as plain base units, no conversion) the first
// time that company touches the Units list, so switching to a managed entity
// never leaves an existing company with an empty dropdown. Anyone can edit
// any of these afterwards to add a base unit + conversion factor (e.g. turn
// "Roll" into "1 Roll = 50 Meter").
const DEFAULT_UNITS = ['pcs', 'kg', 'g', 'box', 'carton', 'dozen', 'liter', 'ml', 'meter', 'cm', 'pack', 'roll', 'pair', 'set', 'bag', 'bottle'];

exports.list = async (req, res) => {
  const { status } = req.query;
  const count = await Unit.count({ where: { company_id: req.companyId } });
  if (count === 0) {
    await Unit.bulkCreate(DEFAULT_UNITS.map((name) => ({ company_id: req.companyId, name_en: name, name_ar: name })));
  }
  const where = { company_id: req.companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  const rows = await Unit.findAll({ where, include: withBase, order: [['name_en', 'ASC']] });
  res.json(rows);
};

// Quick-add friendly: only name_en is required, mirroring ItemCategory's
// inline quick-add. base_unit_id/conversion_factor are optional — a unit
// with neither is treated as its own base unit (factor of 1).
exports.create = async (req, res) => {
  const { name_en, name_ar, base_unit_id, conversion_factor } = req.body;
  if (!name_en) return res.status(400).json({ message: 'name_en is required' });

  let base_unit_id_clean = null;
  if (base_unit_id) {
    const base = await Unit.findOne({ where: { id: base_unit_id, company_id: req.companyId } });
    if (!base) return res.status(400).json({ message: 'Invalid base unit' });
    if (base.base_unit_id) return res.status(400).json({ message: 'Base unit must itself be a base unit (no chained conversions)' });
    base_unit_id_clean = base.id;
  }

  const created = await Unit.create({
    company_id: req.companyId,
    name_en,
    name_ar: name_ar || name_en,
    base_unit_id: base_unit_id_clean,
    conversion_factor: base_unit_id_clean ? Number(conversion_factor || 1) : 1,
  });
  const withRel = await Unit.findByPk(created.id, { include: withBase });
  res.status(201).json(withRel);
};

exports.update = async (req, res) => {
  const unit = await Unit.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!unit) return res.status(404).json({ message: 'Unit not found' });

  const { name_en, name_ar, base_unit_id, conversion_factor, is_active } = req.body;
  let base_unit_id_clean = unit.base_unit_id;
  if (base_unit_id !== undefined) {
    if (!base_unit_id) {
      base_unit_id_clean = null;
    } else {
      if (base_unit_id === unit.id) return res.status(400).json({ message: 'A unit cannot be its own base unit' });
      const base = await Unit.findOne({ where: { id: base_unit_id, company_id: req.companyId } });
      if (!base) return res.status(400).json({ message: 'Invalid base unit' });
      if (base.base_unit_id) return res.status(400).json({ message: 'Base unit must itself be a base unit (no chained conversions)' });
      base_unit_id_clean = base.id;
    }
  }
  // If this unit currently serves as someone else's base unit, don't let it
  // gain a base_unit_id of its own — that would create a two-level chain.
  if (base_unit_id_clean) {
    const dependents = await Unit.count({ where: { base_unit_id: unit.id, company_id: req.companyId } });
    if (dependents > 0) return res.status(400).json({ message: 'This unit is used as a base unit by other units — remove those links first' });
  }

  await unit.update({
    name_en: name_en ?? unit.name_en,
    name_ar: name_ar ?? unit.name_ar,
    base_unit_id: base_unit_id_clean,
    conversion_factor: base_unit_id_clean ? Number(conversion_factor ?? unit.conversion_factor ?? 1) : 1,
    is_active: is_active !== undefined ? is_active : unit.is_active,
  });
  const withRel = await Unit.findByPk(unit.id, { include: withBase });
  res.json(withRel);
};

exports.remove = async (req, res) => {
  const unit = await Unit.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!unit) return res.status(404).json({ message: 'Unit not found' });
  await unit.update({ is_active: false });
  res.json({ message: 'Unit deactivated' });
};
