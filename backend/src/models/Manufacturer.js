// A managed list of manufacturers (production factories a "Manufacture
// Order" is tagged against) — deliberately kept separate from Suppliers even
// though some suppliers are also manufacturers, since the user asked for its
// own dedicated list rather than reusing Suppliers.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Manufacturer', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    phone: { type: DataTypes.STRING(30) },
    address: { type: DataTypes.TEXT },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'manufacturers',
    indexes: [{ unique: true, fields: ['company_id', 'name_en'] }],
  });
};
