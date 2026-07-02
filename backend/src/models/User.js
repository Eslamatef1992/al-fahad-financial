module.exports = (sequelize, DataTypes) => {
  return sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true, validate: { isEmail: true } },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.ENUM('super_admin', 'admin', 'accountant', 'viewer'), defaultValue: 'accountant' },
    preferred_lang: { type: DataTypes.ENUM('en', 'ar'), defaultValue: 'en' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    last_login_at: { type: DataTypes.DATE },
  }, { tableName: 'users' });
};
