module.exports = (sequelize, DataTypes) => {
  return sequelize.define('UserCompany', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    company_id: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.ENUM('admin', 'accountant', 'viewer'), defaultValue: 'accountant' },
    // POS-specific access, independent of the accounting `role` rank above.
    // 'operator' gets every POS capability automatically; 'cashier' only gets
    // the base sale flow (ring up, hold, cash/knet payment) plus whatever
    // extra capabilities the admin lists in pos_permissions (e.g. 'void',
    // 'discount', 'credit_sale'). 'none' means this user isn't a POS user at
    // all (accounting admins/accountants still get POS access automatically
    // at operator level — see posService.resolvePosAccess).
    pos_role: { type: DataTypes.ENUM('none', 'cashier', 'operator'), defaultValue: 'none' },
    pos_permissions: { type: DataTypes.JSONB, defaultValue: [] },
  }, { tableName: 'user_companies' });
};
