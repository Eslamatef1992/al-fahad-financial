module.exports = (sequelize, DataTypes) => {
  return sequelize.define('UserCompany', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    company_id: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.ENUM('admin', 'accountant', 'viewer'), defaultValue: 'accountant' },
  }, { tableName: 'user_companies' });
};
