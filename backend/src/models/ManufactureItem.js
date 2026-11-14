// A made-to-order product (not stocked): carries its spec (color / size / height /
// length), the default selling price, and what the manufacturer charges us. On a
// POS Manufacture Order the operator picks one and may override the selling price;
// manufacturer_cost_price is snapshotted onto the invoice line for profit reporting.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ManufactureItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    category_id: { type: DataTypes.UUID, allowNull: false },
    code: { type: DataTypes.STRING(30), allowNull: false },
    name_en: { type: DataTypes.STRING(150), allowNull: false },
    name_ar: { type: DataTypes.STRING(150), allowNull: false },
    color: { type: DataTypes.STRING(60), allowNull: true },
    size: { type: DataTypes.STRING(60), allowNull: true },
    height: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    length: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    dimension_unit: { type: DataTypes.STRING(10), defaultValue: 'cm' },
    selling_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    manufacturer_cost_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    manufacturer_id: { type: DataTypes.UUID, allowNull: true }, // default manufacturer, optional
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'manufacture_items',
    indexes: [{ unique: true, fields: ['company_id', 'code'] }],
  });
};
