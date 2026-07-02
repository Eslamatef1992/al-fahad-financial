module.exports = (sequelize, DataTypes) => {
  return sequelize.define('FiscalYear', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(50), allowNull: false },
    start_date: { type: DataTypes.DATEONLY, allowNull: false },
    end_date: { type: DataTypes.DATEONLY, allowNull: false },
    is_closed: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, { tableName: 'fiscal_years' });
};
