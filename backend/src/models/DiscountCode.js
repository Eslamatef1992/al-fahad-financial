// A reusable, company-scoped discount code that can be applied to sales (or
// purchase) invoices. `scope` decides WHERE it may be applied: 'invoice'
// codes apply once to the whole invoice (their discount is then allocated
// proportionally across the invoice's lines so the ledger math never has to
// change); 'line' codes apply directly to a single line item. A code is
// always either a percentage or a fixed amount off, set once at creation.
//
// There is deliberately no stored "redemption_count" column — usage is
// always derived live (see discountService.usageCount) by counting how many
// non-cancelled invoices currently reference this code. That way editing or
// deleting a draft invoice automatically frees up capacity again, with no
// manual increment/decrement bookkeeping to keep in sync.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('DiscountCode', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    code: { type: DataTypes.STRING(40), allowNull: false }, // stored uppercased; matched case-insensitively
    description: { type: DataTypes.STRING(255) },
    type: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false },
    value: { type: DataTypes.DECIMAL(18, 3), allowNull: false }, // percent (0-100) or a flat currency amount
    scope: { type: DataTypes.ENUM('invoice', 'line'), allowNull: false, defaultValue: 'invoice' },
    expiry_date: { type: DataTypes.DATEONLY, allowNull: true },
    max_redemptions: { type: DataTypes.INTEGER, allowNull: true }, // null = unlimited
    min_invoice_amount: { type: DataTypes.DECIMAL(18, 3), allowNull: true }, // null = no minimum
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'discount_codes',
    indexes: [{ unique: true, fields: ['company_id', 'code'] }],
  });
};
