module.exports = (sequelize, DataTypes) => {
  return sequelize.define('RecurringInvoiceLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    recurring_invoice_id: { type: DataTypes.UUID, allowNull: false },
    account_id: { type: DataTypes.UUID, allowNull: false },
    description: { type: DataTypes.STRING(255) },
    quantity: { type: DataTypes.DECIMAL(12, 3), defaultValue: 1 },
    unit_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    tax_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    line_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'recurring_invoice_lines' });
};
