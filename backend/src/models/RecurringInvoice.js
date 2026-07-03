// Template that periodically generates real Invoice records (sales or purchase).
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('RecurringInvoice', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM('sales', 'purchase'), allowNull: false },
    client_id: { type: DataTypes.UUID, allowNull: true },
    supplier_id: { type: DataTypes.UUID, allowNull: true },
    cost_center_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(150), allowNull: false }, // e.g. "Monthly Cleaning Contract - ABC Mall"
    frequency: { type: DataTypes.ENUM('weekly', 'monthly', 'quarterly', 'yearly'), allowNull: false },
    due_in_days: { type: DataTypes.INTEGER, defaultValue: 30 }, // due date offset from generated invoice date
    next_run_date: { type: DataTypes.DATEONLY, allowNull: false },
    last_generated_at: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT },
    currency: { type: DataTypes.STRING(10), defaultValue: 'KWD' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'recurring_invoices' });
};
