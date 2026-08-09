// Optional physical/organizational location within a company (e.g. "Cairo
// Branch", "Alexandria Branch"). Purely a reporting/tracking dimension — like
// Cost Centers — attachable to vouchers, invoices, and purchase orders so
// activity can be filtered/grouped by branch. A company that never creates a
// branch sees no change in behavior anywhere.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Branch', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    code: { type: DataTypes.STRING(30), allowNull: false },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    address: { type: DataTypes.TEXT },
    phone: { type: DataTypes.STRING(30) },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'branches',
    indexes: [{ unique: true, fields: ['company_id', 'code'] }],
  });
};
