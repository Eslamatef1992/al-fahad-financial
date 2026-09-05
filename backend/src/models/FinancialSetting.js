// One settings row per company — lets the super admin/admin pre-configure
// which Chart-of-Accounts parent (or, for Items, direct) account each kind of
// record should default to when creating a new Client/Supplier/Employee/
// Vehicle/Cost Center/Item, instead of picking it from the dropdown every
// single time. Every field is optional — the corresponding form's picker
// simply pre-fills with these values but the user can still override before
// saving, and existing behavior is unchanged for any company that never
// configures this.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('FinancialSetting', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    client_parent_account_id: { type: DataTypes.UUID, allowNull: true },
    supplier_parent_account_id: { type: DataTypes.UUID, allowNull: true },
    employee_parent_account_id: { type: DataTypes.UUID, allowNull: true },
    employee_deduction_parent_account_id: { type: DataTypes.UUID, allowNull: true },
    vehicle_parent_account_id: { type: DataTypes.UUID, allowNull: true },
    vehicle_secondary_parent_account_id: { type: DataTypes.UUID, allowNull: true },
    vehicle_tertiary_parent_account_id: { type: DataTypes.UUID, allowNull: true },
    cost_center_parent_account_id: { type: DataTypes.UUID, allowNull: true },
    item_inventory_account_id: { type: DataTypes.UUID, allowNull: true },
    item_income_account_id: { type: DataTypes.UUID, allowNull: true },
    item_cogs_account_id: { type: DataTypes.UUID, allowNull: true },
    // Default GL accounts POS payments post to, so cashiers never have to
    // pick a cash/bank account mid-sale. These are real Chart-of-Accounts
    // asset accounts (typically the same one linked to a Cash Control
    // register), exactly like the account fields above.
    pos_cash_account_id: { type: DataTypes.UUID, allowNull: true },
    pos_knet_account_id: { type: DataTypes.UUID, allowNull: true },
    // Default GL account new Cash Control registers (cash/bank/petty cash)
    // link to. Same pre-fill-only convenience as every other field here —
    // the admin can (and for a second register, should) still pick a
    // different account before saving.
    cash_control_account_id: { type: DataTypes.UUID, allowNull: true },
    // Default expense account a cleared/written-off Damages entry posts its
    // loss to (falls back to the item's own COGS account if left unset).
    damage_expense_account_id: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'financial_settings',
  });
};
