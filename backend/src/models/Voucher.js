// Payment / Receipt / Journal vouchers - header record
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Voucher', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    cost_center_id: { type: DataTypes.UUID, allowNull: true },
    voucher_no: { type: DataTypes.STRING(30), allowNull: false },
    voucher_type: {
      type: DataTypes.ENUM('receipt', 'payment', 'journal'),
      allowNull: false,
    },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.TEXT },
    currency: { type: DataTypes.STRING(10), defaultValue: 'KWD' },
    status: { type: DataTypes.ENUM('draft', 'posted', 'cancelled'), defaultValue: 'draft' },
    total_debit: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    total_credit: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    created_by: { type: DataTypes.UUID, allowNull: true },
    posted_at: { type: DataTypes.DATE, allowNull: true },
  }, { tableName: 'vouchers', indexes: [{ unique: true, fields: ['company_id', 'voucher_no'] }] });
};
