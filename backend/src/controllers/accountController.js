const {
  Account, Client, Supplier, Employee, CashAccount, Vehicle, CostCenter,
  VoucherLine, LedgerEntry, Invoice, InvoiceLine, RecurringInvoiceLine,
} = require('../models');

// Walks parent_id links to find an account plus every descendant (sub-accounts, sub-sub-accounts...).
// Returned in breadth-first order (root first) so reversing it gives a safe deepest-first delete order.
async function collectSubtreeIds(rootId, companyId) {
  const all = await Account.findAll({ where: { company_id: companyId }, attributes: ['id', 'parent_id'] });
  const byParent = {};
  all.forEach((a) => { (byParent[a.parent_id] = byParent[a.parent_id] || []).push(a.id); });
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift();
    (byParent[cur] || []).forEach((childId) => { ids.push(childId); queue.push(childId); });
  }
  return ids;
}

// Returns full chart of accounts as a nested tree for the active company
exports.tree = async (req, res) => {
  const accounts = await Account.findAll({
    where: { company_id: req.companyId },
    order: [['code', 'ASC']],
  });

  const byId = {};
  accounts.forEach((a) => { byId[a.id] = { ...a.toJSON(), children: [] }; });
  const roots = [];
  accounts.forEach((a) => {
    if (a.parent_id && byId[a.parent_id]) {
      byId[a.parent_id].children.push(byId[a.id]);
    } else {
      roots.push(byId[a.id]);
    }
  });
  res.json(roots);
};

exports.list = async (req, res) => {
  const { status } = req.query;
  const where = { company_id: req.companyId };
  // Default to active accounts only (so deactivated accounts can't be selected for new
  // postings / as a parent). Pass ?status=all to include inactive ones (e.g. management UI).
  if (status !== 'all') where.is_active = status === 'inactive' ? false : true;
  const accounts = await Account.findAll({ where, order: [['code', 'ASC']] });
  res.json(accounts);
};

exports.create = async (req, res) => {
  const { parent_id } = req.body;
  let level = 1;
  if (parent_id) {
    const parent = await Account.findByPk(parent_id);
    if (!parent) return res.status(400).json({ message: 'Parent account not found' });
    level = parent.level + 1;
    // A group account cannot receive direct postings once it has children
    if (!parent.is_group) {
      parent.is_group = true;
      await parent.save();
    }
  }
  const account = await Account.create({ ...req.body, company_id: req.companyId, level });
  res.status(201).json(account);
};

exports.update = async (req, res) => {
  const account = await Account.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!account) return res.status(404).json({ message: 'Account not found' });
  await account.update(req.body);
  res.json(account);
};

exports.remove = async (req, res) => {
  const account = await Account.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!account) return res.status(404).json({ message: 'Account not found' });

  const subtreeIds = await collectSubtreeIds(account.id, req.companyId);

  // Check whether this account or any of its sub-accounts is actually in use anywhere —
  // if so we must not hard-delete (would silently break historical vouchers/ledger/reports).
  const refCounts = await Promise.all([
    Client.count({ where: { account_id: subtreeIds } }),
    Supplier.count({ where: { account_id: subtreeIds } }),
    Employee.count({ where: { account_id: subtreeIds } }),
    Employee.count({ where: { deduction_account_id: subtreeIds } }),
    CashAccount.count({ where: { account_id: subtreeIds } }),
    Vehicle.count({ where: { account_id: subtreeIds } }),
    Vehicle.count({ where: { secondary_account_id: subtreeIds } }),
    Vehicle.count({ where: { tertiary_account_id: subtreeIds } }),
    CostCenter.count({ where: { account_id: subtreeIds } }),
    VoucherLine.count({ where: { account_id: subtreeIds } }),
    LedgerEntry.count({ where: { account_id: subtreeIds } }),
    Invoice.count({ where: { tax_account_id: subtreeIds } }),
    InvoiceLine.count({ where: { account_id: subtreeIds } }),
    RecurringInvoiceLine.count({ where: { account_id: subtreeIds } }),
  ]);
  const isInUse = refCounts.some((c) => c > 0);

  if (isInUse) {
    if (subtreeIds.length > 1) return res.status(400).json({ message: 'Cannot delete an account that has sub-accounts' });
    await account.update({ is_active: false });
    return res.json({ message: 'Account deactivated (in use by existing records)' });
  }

  // Nothing references this account or any of its sub-accounts — permanently remove the
  // whole subtree. Delete deepest accounts first since parent_id self-references this table.
  for (let i = subtreeIds.length - 1; i >= 0; i--) {
    await Account.destroy({ where: { id: subtreeIds[i] } });
  }
  res.json({ message: 'Account permanently deleted', deletedCount: subtreeIds.length });
};
