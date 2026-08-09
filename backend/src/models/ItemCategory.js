// A managed, reusable category for Inventory Items — created once by the
// user (e.g. "Electronics", "Stationery") and then picked from a dropdown
// when creating/editing items, instead of retyping free text every time.
// Item.category (a plain string) is kept untouched for old/legacy data —
// new items link here via Item.category_id instead.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ItemCategory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    name_en: { type: DataTypes.STRING(100), allowNull: false },
    name_ar: { type: DataTypes.STRING(100), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'item_categories',
    indexes: [{ unique: true, fields: ['company_id', 'name_en'] }],
  });
};
