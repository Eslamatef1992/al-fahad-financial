module.exports = (sequelize, DataTypes) => {
  return sequelize.define('CostCenter', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    parent_id: { type: DataTypes.UUID, allowNull: true },
    code: { type: DataTypes.STRING(30), allowNull: false },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'cost_centers',
    indexes: [{ unique: true, fields: ['company_id', 'code'] }],
  });
};
