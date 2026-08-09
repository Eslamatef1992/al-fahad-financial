// Immutable stock-movement ledger for Items — one row per quantity change, so
// every increase/decrease in quantity_on_hand and cost_price is auditable and
// traceable back to its source document, mirroring how LedgerEntry backs the
// financial ledger.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('InventoryTransaction', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    item_id: { type: DataTypes.UUID, allowNull: false },
    type: {
      type: DataTypes.ENUM('opening', 'purchase_receipt', 'sale', 'adjustment'),
      allowNull: false,
    },
    reference_type: { type: DataTypes.STRING(30) }, // 'invoice', 'manual', ...
    reference_id: { type: DataTypes.UUID, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(18, 3), allowNull: false }, // positive = in, negative = out
    unit_cost: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    balance_qty_after: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    balance_value_after: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    notes: { type: DataTypes.STRING(255) },
    created_by: { type: DataTypes.UUID, allowNull: true },
  }, { tableName: 'inventory_transactions' });
};
