module.exports = (sequelize, DataTypes) => {
  return sequelize.define('VoucherLine', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    voucher_id: { type: DataTypes.UUID, allowNull: false },
    account_id: { type: DataTypes.UUID, allowNull: false },
    cost_center_id: { type: DataTypes.UUID, allowNull: true },
    client_id: { type: DataTypes.UUID, allowNull: true },
    supplier_id: { type: DataTypes.UUID, allowNull: true },
    debit: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    credit: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    description: { type: DataTypes.TEXT },
    line_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'voucher_lines' });
};
