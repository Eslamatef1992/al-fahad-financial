// Generated automatically when a voucher is posted. Immutable audit trail feeding General Ledger.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('LedgerEntry', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    voucher_id: { type: DataTypes.UUID, allowNull: false },
    voucher_line_id: { type: DataTypes.UUID, allowNull: false },
    account_id: { type: DataTypes.UUID, allowNull: false },
    cost_center_id: { type: DataTypes.UUID, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    debit: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    credit: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    description: { type: DataTypes.TEXT },
  }, { tableName: 'ledger_entries' });
};
