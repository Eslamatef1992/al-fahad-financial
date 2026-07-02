// Generic audit trail: records every mutating (POST/PUT/PATCH/DELETE) API call
// that completed successfully, capturing who did it, from where, and on what path.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('AuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    method: { type: DataTypes.STRING(10), allowNull: false },
    path: { type: DataTypes.STRING(255), allowNull: false },
    action: { type: DataTypes.STRING(30) },       // create | update | delete | post | cancel | assign-driver | login | other
    resource_type: { type: DataTypes.STRING(50) }, // e.g. Voucher, Account, Client
    status_code: { type: DataTypes.INTEGER },
    ip_address: { type: DataTypes.STRING(64) },
  }, { tableName: 'audit_logs' });
};
