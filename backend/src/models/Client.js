module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Client', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    account_id: { type: DataTypes.UUID, allowNull: true },
    code: { type: DataTypes.STRING(30), allowNull: false },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    phone: { type: DataTypes.STRING(30) },
    email: { type: DataTypes.STRING(150) },
    address: { type: DataTypes.TEXT },
    tax_no: { type: DataTypes.STRING(50) },
    credit_limit: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    opening_balance: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'clients', indexes: [{ unique: true, fields: ['company_id', 'code'] }] });
};
