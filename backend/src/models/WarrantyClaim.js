// A warranty replacement (same item, in warranty) or an exchange (swap for another
// item, paying/receiving the price difference) against a sold invoice line.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('WarrantyClaim', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    claim_no: { type: DataTypes.STRING(30), allowNull: false },
    type: { type: DataTypes.STRING(12), allowNull: false },           // replacement | exchange
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    invoice_line_id: { type: DataTypes.UUID, allowNull: false },
    client_id: { type: DataTypes.UUID, allowNull: true },
    branch_id: { type: DataTypes.UUID, allowNull: true },
    item_id: { type: DataTypes.UUID, allowNull: false },               // the item the client brings back
    quantity: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    in_warranty: { type: DataTypes.BOOLEAN, defaultValue: false },
    warranty_override: { type: DataTypes.BOOLEAN, defaultValue: false }, // super admin accepted an out-of-warranty claim
    // replacement: cost of the unit given out; exchange: the new item, its price and the settlement
    new_item_id: { type: DataTypes.UUID, allowNull: true },
    new_unit_price: { type: DataTypes.DECIMAL(18, 3), allowNull: true },
    credit_amount: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },       // value credited for the returned item (exchange)
    new_total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },           // value of the new item (exchange)
    price_difference: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },    // >0 client paid, <0 client refunded
    settlement_method: { type: DataTypes.STRING(12), allowNull: true },
    replacement_cost: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    return_id: { type: DataTypes.UUID, allowNull: true },                     // exchange: credit note for the returned item
    new_invoice_id: { type: DataTypes.UUID, allowNull: true },                // exchange: invoice for the new item
    voucher_id: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING(12), defaultValue: 'completed' },
    created_by: { type: DataTypes.UUID, allowNull: true },
  }, { tableName: 'warranty_claims', indexes: [{ unique: true, fields: ['company_id', 'claim_no'] }] });
};
