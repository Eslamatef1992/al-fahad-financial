// Per-(variant, branch) running stock balance — the variant-level equivalent
// of ItemBranchStock. Kept as a fully separate table (rather than adding a
// nullable variant_id onto ItemBranchStock) so plain, non-variant items never
// touch this table at all and their existing unique index/behavior is
// untouched.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ItemVariantBranchStock', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    variant_id: { type: DataTypes.UUID, allowNull: false },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    quantity_on_hand: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    cost_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
  }, {
    tableName: 'item_variant_branch_stocks',
    indexes: [{ unique: true, fields: ['variant_id', 'branch_id'] }],
  });
};
