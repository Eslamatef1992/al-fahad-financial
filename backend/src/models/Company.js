module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Company', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    industry: { type: DataTypes.STRING(100) },
    logo_url: { type: DataTypes.STRING(255) },
    base_currency: { type: DataTypes.STRING(10), defaultValue: 'KWD' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'companies' });
};
