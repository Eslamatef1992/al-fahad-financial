// A cashier's till session at a branch. Opening it records the starting cash
// float; every POS sale rung up while it's open is tagged with its id (see
// Invoice.pos_shift_id); closing it counts the drawer and records any
// over/short variance against the expected cash (float + cash sales taken).
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('PosShift', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    branch_id: { type: DataTypes.UUID, allowNull: true },
    cashier_id: { type: DataTypes.UUID, allowNull: false },
    opening_float: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    opened_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    closed_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.ENUM('open', 'closed'), defaultValue: 'open' },
    expected_cash: { type: DataTypes.DECIMAL(18, 3), allowNull: true },
    counted_cash: { type: DataTypes.DECIMAL(18, 3), allowNull: true },
    variance: { type: DataTypes.DECIMAL(18, 3), allowNull: true },
    notes: { type: DataTypes.TEXT },
  }, { tableName: 'pos_shifts' });
};
