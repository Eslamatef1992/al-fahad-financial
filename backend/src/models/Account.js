// Chart of Accounts - dynamic/unlimited nested sub-levels via parent_id self-reference
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Account', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    parent_id: { type: DataTypes.UUID, allowNull: true },
    code: { type: DataTypes.STRING(30), allowNull: false },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    type: {
      type: DataTypes.ENUM('asset', 'liability', 'equity', 'revenue', 'expense'),
      allowNull: false,
    },
    level: { type: DataTypes.INTEGER, defaultValue: 1 },
    is_group: { type: DataTypes.BOOLEAN, defaultValue: false }, // true = header/parent account, no direct postings
    normal_balance: { type: DataTypes.ENUM('debit', 'credit'), allowNull: false },
    opening_balance: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    currency: { type: DataTypes.STRING(10), defaultValue: 'KWD' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'accounts',
    indexes: [{ unique: true, fields: ['company_id', 'code'] }],
  });
};
