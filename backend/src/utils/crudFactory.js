// Generic company-scoped CRUD controller factory to avoid repeating boilerplate
// across simple modules (Clients, Suppliers, Employees, Cash Accounts, etc.)
function crudFactory(Model, { include = [], searchFields = [] } = {}) {
  return {
    list: async (req, res) => {
      const { q, status } = req.query;
      const where = { company_id: req.companyId };
      // Deactivated (soft-deleted) records are hidden by default so a "delete" actually
      // disappears from the list. Pass ?status=all or ?status=inactive to see them again.
      if (Object.prototype.hasOwnProperty.call(Model.rawAttributes, 'is_active') && status !== 'all') {
        where.is_active = status === 'inactive' ? false : true;
      }
      const items = await Model.findAll({ where, include, order: [['createdAt', 'DESC']] });
      if (q && searchFields.length) {
        const needle = q.toLowerCase();
        return res.json(items.filter((i) => searchFields.some((f) => String(i[f] || '').toLowerCase().includes(needle))));
      }
      res.json(items);
    },
    get: async (req, res) => {
      const item = await Model.findOne({ where: { id: req.params.id, company_id: req.companyId }, include });
      if (!item) return res.status(404).json({ message: 'Not found' });
      res.json(item);
    },
    create: async (req, res) => {
      const item = await Model.create({ ...req.body, company_id: req.companyId });
      res.status(201).json(item);
    },
    update: async (req, res) => {
      const item = await Model.findOne({ where: { id: req.params.id, company_id: req.companyId } });
      if (!item) return res.status(404).json({ message: 'Not found' });
      await item.update(req.body);
      res.json(item);
    },
    remove: async (req, res) => {
      const item = await Model.findOne({ where: { id: req.params.id, company_id: req.companyId } });
      if (!item) return res.status(404).json({ message: 'Not found' });
      if ('is_active' in item.dataValues) {
        await item.update({ is_active: false });
        return res.json({ message: 'Deactivated' });
      }
      await item.destroy();
      res.json({ message: 'Deleted' });
    },
  };
}

module.exports = crudFactory;
