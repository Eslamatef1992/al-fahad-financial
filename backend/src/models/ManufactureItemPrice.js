// One manufacturer's quote for a made-to-order item: what they charge us (cost)
// and what we sell it for when that manufacturer is used. An item can carry
// several of these so the POS operator picks the manufacturer per order line.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ManufactureItemPrice', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    item_id: { type: DataTypes.UUID, allowNull: false },
    manufacturer_id: { type: DataTypes.UUID, allowNull: false },
    cost_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    selling_price: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
  }, { tableName: 'manufacture_item_prices', indexes: [{ unique: true, fields: ['item_id', 'manufacturer_id'] }] });
};
