// Join table letting a Branch link to any number of Chart-of-Accounts
// accounts (e.g. its own cash account, a dedicated revenue account, an
// expense account) — an open-ended tag-style link, unlike the single
// account_id pattern used by Cost Center/Client/Supplier.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('BranchAccount', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    account_id: { type: DataTypes.UUID, allowNull: false },
  }, {
    tableName: 'branch_accounts',
    indexes: [{ unique: true, fields: ['branch_id', 'account_id'] }],
  });
};
