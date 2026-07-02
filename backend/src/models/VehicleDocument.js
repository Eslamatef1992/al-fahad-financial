module.exports = (sequelize, DataTypes) => {
  return sequelize.define('VehicleDocument', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    vehicle_id: { type: DataTypes.UUID, allowNull: false },
    doc_type: { type: DataTypes.STRING(60), allowNull: false }, // registration, insurance, inspection, permit...
    doc_number: { type: DataTypes.STRING(60) },
    issue_date: { type: DataTypes.DATEONLY },
    expiry_date: { type: DataTypes.DATEONLY },
    file_url: { type: DataTypes.STRING(255) },
    file_name: { type: DataTypes.STRING(255) },
    notes: { type: DataTypes.TEXT },
  }, { tableName: 'vehicle_documents' });
};
