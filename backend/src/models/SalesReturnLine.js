module.exports = (sequelize, DataTypes) => {
  return sequelize.define('SalesReturnLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    return_id: { type: DataTypes.UUID, allowNull: false },
    invoice_line_id: { type: DataTypes.UUID, allowNull: false },
    item_id: { type: DataTypes.UUID, allowNull: true },
    variant_id: { type: DataTypes.UUID, allowNull: true },
    description: { type: DataTypes.STRING(255), allowNull: true },
    quantity: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    unit_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_subtotal: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_tax: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    release_qty: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 }, // part of the quantity that was only a booking (released, never delivered)
    stock_status: { type: DataTypes.STRING(10), defaultValue: 'none' },  // none | pending | confirmed
    disposition: { type: DataTypes.STRING(12), defaultValue: 'restock' }, // restock | damaged
    unit_cost: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },       // original sale cost of the goods
  }, { tableName: 'sales_return_lines' });
};
