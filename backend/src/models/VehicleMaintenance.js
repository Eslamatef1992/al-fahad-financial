module.exports = (sequelize, DataTypes) => {
  return sequelize.define('VehicleMaintenance', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    vehicle_id: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    type: { type: DataTypes.STRING(60) }, // service, repair, tires, oil change...
    odometer: { type: DataTypes.DECIMAL(12, 1) },
    cost: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    vendor: { type: DataTypes.STRING(150) },
    description: { type: DataTypes.TEXT },
  }, { tableName: 'vehicle_maintenance' });
};
