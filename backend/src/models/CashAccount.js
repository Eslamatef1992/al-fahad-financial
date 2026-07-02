// Control Cash module - cash/bank accounts tracked per company
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('CashAccount', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    account_id: { type: DataTypes.UUID, allowNull: false }, // linked GL account
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    type: { type: DataTypes.ENUM('cash', 'bank', 'petty_cash'), defaultValue: 'cash' },
    custodian_employee_id: { type: DataTypes.UUID, allowNull: true }, // who holds petty cash
    bank_name: { type: DataTypes.STRING(150) },
    iban: { type: DataTypes.STRING(60) },
    currency: { type: DataTypes.STRING(10), defaultValue: 'KWD' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'cash_accounts' });
};
