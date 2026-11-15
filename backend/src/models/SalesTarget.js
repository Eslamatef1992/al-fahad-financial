// A monthly sales target for one sales person, optionally narrowed to a branch,
// an item category or a single item. Actual sales are always derived live from
// invoices (minus returns), never stored. Commission is a % of the achieved
// (in-scope) sales, paid either always or only once the target is reached.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('SalesTarget', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    salesperson_id: { type: DataTypes.UUID, allowNull: false },
    month: { type: DataTypes.DATEONLY, allowNull: false }, // first day of the month
    target_amount: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    branch_id: { type: DataTypes.UUID, allowNull: true },
    category_id: { type: DataTypes.UUID, allowNull: true },
    item_id: { type: DataTypes.UUID, allowNull: true },
    commission_pct: { type: DataTypes.DECIMAL(6, 3), defaultValue: 0 },
    commission_mode: { type: DataTypes.STRING(20), defaultValue: 'on_achievement' }, // on_achievement | always
    notes: { type: DataTypes.STRING(255), allowNull: true },
  }, { tableName: 'sales_targets' });
};
