const { Item, Account, InventoryTransaction, Company } = require('../models');
const itemService = require('../services/itemService');
const { generateItemsPdf } = require('../services/pdfService');
const { exportItems } = require('../services/excelService');

const accountInclude = [
  { model: Account, as: 'inventoryAccount' },
  { model: Account, as: 'incomeAccount' },
  { model: Account, as: 'cogsAccount' },
];

exports.list = async (req, res) => {
  const { q, status } = req.query;
  const where = { company_id: req.companyId };
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;

  const items = await Item.findAll({ where, include: accountInclude, order: [['createdAt', 'DESC']] });
  if (q) {
    const needle = q.toLowerCase();
    return res.json(items.filter((i) => [i.name_en, i.name_ar, i.code, i.category]
      .some((f) => String(f || '').toLowerCase().includes(needle))));
  }
  res.json(items);
};

exports.get = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId }, include: accountInclude });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  res.json(item);
};

exports.create = async (req, res) => {
  const item = await itemService.createItem(req.companyId, req.user.id, req.body);
  const withAccounts = await Item.findByPk(item.id, { include: accountInclude });
  res.status(201).json(withAccounts);
};

exports.update = async (req, res) => {
  const item = await itemService.updateItem(req.companyId, req.params.id, req.body);
  const withAccounts = await Item.findByPk(item.id, { include: accountInclude });
  res.json(withAccounts);
};

exports.remove = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  await item.update({ is_active: false });
  res.json({ message: 'Deactivated' });
};

// Manual stock correction (count adjustment, damage write-off, etc.) — logged
// through the same InventoryTransaction audit trail as every other movement.
exports.adjustStock = async (req, res) => {
  const item = await itemService.adjustStock(req.companyId, req.params.id, req.user.id, req.body);
  const withAccounts = await Item.findByPk(item.id, { include: accountInclude });
  res.json(withAccounts);
};

exports.transactions = async (req, res) => {
  const item = await Item.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Item not found' });
  const rows = await InventoryTransaction.findAll({
    where: { item_id: item.id, company_id: req.companyId },
    order: [['createdAt', 'DESC']],
  });
  res.json(rows);
};

exports.pdf = async (req, res) => {
  const rows = await Item.findAll({ where: { company_id: req.companyId, is_active: true }, include: accountInclude, order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  generateItemsPdf(res, rows, company);
};

exports.exportExcel = async (req, res) => {
  const rows = await Item.findAll({ where: { company_id: req.companyId, is_active: true }, include: accountInclude, order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  await exportItems(res, company, rows);
};
