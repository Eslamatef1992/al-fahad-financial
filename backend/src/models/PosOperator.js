// A till operator who signs in at the POS-only site (pos.<domain>) with username + password.
// Backed by a real (hidden, low-privilege) User so shifts / sales / audit all work unchanged.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('PosOperator', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    username: { type: DataTypes.STRING(60), allowNull: false },
    branch_id: { type: DataTypes.UUID, allowNull: false },
    salesperson_id: { type: DataTypes.UUID, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'pos_operators', indexes: [{ unique: true, fields: ['company_id', 'username'] }] });
};
