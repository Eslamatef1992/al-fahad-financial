// A trackable variant of an Item — e.g. Color: Red / Size: L — with its own
// SKU and its own stock balance. Mirrors Item's own quantity_on_hand/cost_price
// fields exactly (same weighted-average pattern), representing this variant's
// company-wide "unbranched pool" balance; ItemVariantBranchStock extends that
// with a per-branch balance the same way ItemBranchStock does for plain items.
// An item that has no rows here is tracked exactly as before, at the Item
// level — variants are purely additive and opt-in per item.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ItemVariant', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    item_id: { type: DataTypes.UUID, allowNull: false },
    sku: { type: DataTypes.STRING(60), allowNull: false },
    // e.g. { "Color": "Red", "Size": "L" } — keys should match the parent
    // Item's variant_attributes list, enforced at the service layer.
    attributes: { type: DataTypes.JSON, defaultValue: {} },
    quantity_on_hand: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    cost_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    selling_price: { type: DataTypes.DECIMAL(18, 3), allowNull: true }, // null = use parent item's selling_price
    reorder_level: { type: DataTypes.DECIMAL(18, 3), allowNull: true }, // null = use parent item's reorder_level
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'item_variants',
    indexes: [
      { unique: true, fields: ['company_id', 'sku'] },
      { fields: ['item_id'] },
    ],
  });
};
