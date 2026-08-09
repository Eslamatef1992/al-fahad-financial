// One item (optionally one specific ItemVariant) moved by a StockTransfer.
// unit_cost is recorded at posting time (the source's weighted-average cost
// at that moment) — a transfer relocates stock, it does not revalue it.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('StockTransferLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    transfer_id: { type: DataTypes.UUID, allowNull: false },
    item_id: { type: DataTypes.UUID, allowNull: false },
    variant_id: { type: DataTypes.UUID, allowNull: true }, // null = plain item, no variant
    quantity: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    unit_cost: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    line_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'stock_transfer_lines' });
};
