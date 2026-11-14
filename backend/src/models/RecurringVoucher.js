// Template that periodically generates DRAFT Vouchers (receipt/payment/journal).
// Lines are stored inline as JSON ([{account_id, debit, credit, description}]) —
// they're only ever read back as a whole to build the voucher, never queried.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('RecurringVoucher', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    voucher_type: { type: DataTypes.ENUM('receipt', 'payment', 'journal'), allowNull: false },
    frequency: { type: DataTypes.ENUM('weekly', 'monthly', 'quarterly', 'yearly'), allowNull: false },
    next_run_date: { type: DataTypes.DATEONLY, allowNull: false },
    last_generated_at: { type: DataTypes.DATE, allowNull: true },
    description: { type: DataTypes.TEXT },
    currency: { type: DataTypes.STRING(10), defaultValue: 'KWD' },
    cost_center_id: { type: DataTypes.UUID, allowNull: true },
    branch_id: { type: DataTypes.UUID, allowNull: true },
    lines: { type: DataTypes.JSON, defaultValue: [] },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'recurring_vouchers' });
};
