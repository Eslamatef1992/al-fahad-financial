module.exports = (sequelize, DataTypes) => {
  return sequelize.define('InvoiceLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    account_id: { type: DataTypes.UUID, allowNull: false }, // revenue account (sales) or expense account (purchase)
    description: { type: DataTypes.STRING(255) },
    quantity: { type: DataTypes.DECIMAL(12, 3), defaultValue: 1 },
    unit_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    tax_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 }, // percent, e.g. 5.00
    line_subtotal: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_tax: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'invoice_lines' });
};
