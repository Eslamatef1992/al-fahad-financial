// A person who sells at the POS/counter. Several can share one till; the one
// chosen on an invoice gets the credit for targets and commission.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('SalesPerson', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: true },   // optional login that maps to this person
    branch_id: { type: DataTypes.UUID, allowNull: true }, // home branch (optional)
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'sales_people' });
};
