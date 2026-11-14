// Category of made-to-order products (e.g. "Mattress covers", "Headboards").
// Maintained by a super admin; read by the POS when a Manufacture Order is rung up.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ManufactureCategory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    name_en: { type: DataTypes.STRING(120), allowNull: false },
    name_ar: { type: DataTypes.STRING(120), allowNull: false },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'manufacture_categories',
    indexes: [{ unique: true, fields: ['company_id', 'name_en'] }],
  });
};
