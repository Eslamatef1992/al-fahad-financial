// A stock transfer document moving one or more items (optionally specific
// variants) from one location to another — either location may be a real
// Branch or null (the company's unbranched stock pool). This is the header;
// see StockTransferLine for the actual item/variant/quantity rows, mirroring
// the Invoice/PurchaseOrder header+lines pattern so a single transfer can move
// several items at once. Logged as a real, immutable document with matching
// InventoryTransaction rows (transfer_out / transfer_in) per line so every
// movement is fully auditable from both the transfer log and each item's own
// transaction history.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('StockTransfer', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    transfer_no: { type: DataTypes.STRING(30), allowNull: false },
    from_branch_id: { type: DataTypes.UUID, allowNull: true }, // null = unbranched pool
    to_branch_id: { type: DataTypes.UUID, allowNull: true },   // null = unbranched pool
    date: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.TEXT },
    created_by: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'stock_transfers',
    indexes: [{ unique: true, fields: ['company_id', 'transfer_no'] }],
  });
};
