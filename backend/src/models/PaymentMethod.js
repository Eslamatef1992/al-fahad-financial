// Admin-defined list of ways a payment can be tendered (Cash, Knet, Tabby,
// Bank Transfer, ...), each linked to exactly one Chart-of-Accounts account
// it settles into. Replaces the old fixed Cash/Knet/Other list in POS
// checkout and invoice payments with something a super admin can configure
// per company. Only a super admin may create/edit/deactivate these (they
// define real GL posting behavior), but any authenticated user in the
// company can list them, since cashiers need to see them at checkout.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('PaymentMethod', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    name_en: { type: DataTypes.STRING(100), allowNull: false },
    name_ar: { type: DataTypes.STRING(100), allowNull: false },
    account_id: { type: DataTypes.UUID, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'payment_methods',
    indexes: [{ unique: true, fields: ['company_id', 'name_en'] }],
  });
};
