// Per-(item, branch) running stock balance — mirrors Item.quantity_on_hand /
// cost_price but scoped to a single branch, enabling true multi-location
// weighted-average costing. A missing row for a given (item, branch) pair
// means zero stock there; rows are created lazily on first movement.
// Item.quantity_on_hand/cost_price themselves continue to represent the
// company's "unbranched" stock pool (used whenever no branch is selected),
// so companies that never use Branches see no change in behavior at all.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ItemBranchStock', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    item_id: { type: DataTypes.UUID, allowNull: false },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    quantity_on_hand: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    cost_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
  }, {
    tableName: 'item_branch_stocks',
    indexes: [{ unique: true, fields: ['item_id', 'branch_id'] }],
  });
};
