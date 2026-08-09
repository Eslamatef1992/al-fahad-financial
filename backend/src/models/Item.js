// Inventory item / product master. Stock quantity and cost_price are
// system-maintained (weighted-average costing, single warehouse) — they only
// change via itemService.receiveStock/issueStock/adjustStock, never via a
// direct field edit, so every movement stays traceable through
// InventoryTransaction.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Item', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    code: { type: DataTypes.STRING(30), allowNull: false },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    category: { type: DataTypes.STRING(100) },
    unit: { type: DataTypes.STRING(30), defaultValue: 'pcs' },
    // Chart-of-Accounts links — where this item's value/movements post to.
    inventory_account_id: { type: DataTypes.UUID, allowNull: false }, // asset: stock value
    income_account_id: { type: DataTypes.UUID, allowNull: false },    // revenue: default sales line account
    cogs_account_id: { type: DataTypes.UUID, allowNull: false },      // expense: cost of goods sold
    selling_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    cost_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },       // running weighted-average cost
    quantity_on_hand: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 }, // running stock balance
    reorder_level: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'items',
    indexes: [{ unique: true, fields: ['company_id', 'code'] }],
  });
};
