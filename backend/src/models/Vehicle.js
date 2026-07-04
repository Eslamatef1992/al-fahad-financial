// Full vehicle data as requested, with driver assignment
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Vehicle', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    assigned_driver_id: { type: DataTypes.UUID, allowNull: true },
    account_id: { type: DataTypes.UUID, allowNull: true },
    code: { type: DataTypes.STRING(30), allowNull: false },
    plate_no: { type: DataTypes.STRING(30), allowNull: false },
    make: { type: DataTypes.STRING(60) },
    model: { type: DataTypes.STRING(60) },
    year: { type: DataTypes.INTEGER },
    color: { type: DataTypes.STRING(30) },
    vin: { type: DataTypes.STRING(50) },
    chassis_no: { type: DataTypes.STRING(50) },
    engine_no: { type: DataTypes.STRING(50) },
    vehicle_type: { type: DataTypes.STRING(50) }, // sedan, truck, van, bus...
    ownership_type: { type: DataTypes.ENUM('owned', 'leased', 'rented'), defaultValue: 'owned' },
    registration_no: { type: DataTypes.STRING(50) },
    registration_expiry: { type: DataTypes.DATEONLY },
    insurance_company: { type: DataTypes.STRING(100) },
    insurance_policy_no: { type: DataTypes.STRING(50) },
    insurance_type: { type: DataTypes.STRING(50) },
    insurance_expiry: { type: DataTypes.DATEONLY },
    purchase_date: { type: DataTypes.DATEONLY },
    purchase_cost: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    fuel_type: { type: DataTypes.STRING(30) },
    current_odometer: { type: DataTypes.DECIMAL(12, 1), defaultValue: 0 },
    status: { type: DataTypes.ENUM('active', 'maintenance', 'inactive', 'sold'), defaultValue: 'active' },
    notes: { type: DataTypes.TEXT },
  }, { tableName: 'vehicles', indexes: [{ unique: true, fields: ['company_id', 'code'] }] });
};
