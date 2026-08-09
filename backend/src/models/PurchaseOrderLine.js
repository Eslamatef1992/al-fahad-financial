// Each PO line either links to an inventory Item (stock will be received on
// conversion) or posts directly to any chosen Chart-of-Accounts account (e.g.
// a one-off expense) — account_id is always present so every line has a clear
// GL destination once converted to a bill, exactly like InvoiceLine.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('PurchaseOrderLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    purchase_order_id: { type: DataTypes.UUID, allowNull: false },
    item_id: { type: DataTypes.UUID, allowNull: true },
    account_id: { type: DataTypes.UUID, allowNull: false },
    description: { type: DataTypes.STRING(255) },
    quantity: { type: DataTypes.DECIMAL(12, 3), defaultValue: 1 },
    unit_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    tax_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
    line_subtotal: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_tax: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'purchase_order_lines' });
};
