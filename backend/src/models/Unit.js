// A managed unit of measure for Inventory Items — e.g. "Piece", "Meter",
// "Kilogram" as base units, or "Box", "Roll", "Carton" as derived units that
// convert into a base unit via conversion_factor (e.g. "Box" -> base "Piece",
// factor 12 means 1 Box = 12 Piece; "Roll" -> base "Meter", factor 50 means
// 1 Roll = 50 Meter). This is what was missing before: picking "meter" (or
// any unit) on an item never let you say how many of some other unit it
// actually represents.
// Item.unit (a plain string) is kept untouched for old/legacy data — new
// items link here via Item.unit_id instead, same pattern as ItemCategory.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Unit', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    name_en: { type: DataTypes.STRING(50), allowNull: false },
    name_ar: { type: DataTypes.STRING(50), allowNull: true },
    // If set, this unit converts into another (base) unit. Kept to a single
    // level (a base unit's own base_unit_id must be null) so conversions are
    // always a simple multiply/divide, never a chain to resolve.
    base_unit_id: { type: DataTypes.UUID, allowNull: true },
    // How many of the base unit one of this unit equals. Meaningless (and
    // ignored) when base_unit_id is null — a base unit is always "1 of itself".
    conversion_factor: { type: DataTypes.DECIMAL(18, 6), allowNull: false, defaultValue: 1 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'units',
    indexes: [{ unique: true, fields: ['company_id', 'name_en'] }],
  });
};
