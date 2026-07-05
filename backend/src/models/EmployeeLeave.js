// A log of individual vacation/sick-leave entries taken by an employee. Each entry
// deducts from the employee's running vacation_balance/sick_leave_balance (see
// employeeLeaveController), so the balance shown on the Employee record always reflects
// leave actually logged rather than being a number an admin has to remember to decrement
// by hand.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('EmployeeLeave', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM('vacation', 'sick'), allowNull: false },
    date_from: { type: DataTypes.DATEONLY, allowNull: false },
    date_to: { type: DataTypes.DATEONLY, allowNull: false },
    days: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
    notes: { type: DataTypes.STRING(255) },
    created_by: { type: DataTypes.UUID, allowNull: true },
  }, { tableName: 'employee_leaves' });
};
