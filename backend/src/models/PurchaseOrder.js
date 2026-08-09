// Purchase Order — a draft procurement document with no ledger impact of its
// own. Once goods/services are received it is converted into a real Purchase
// Bill (Invoice type='purchase'), which is what actually posts to the ledger
// (and, for item lines, receives stock). This mirrors how RecurringInvoice
// generates real Invoices rather than posting itself.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('PurchaseOrder', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    supplier_id: { type: DataTypes.UUID, allowNull: false },
    po_no: { type: DataTypes.STRING(30), allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    expected_date: { type: DataTypes.DATEONLY, allowNull: true },
    cost_center_id: { type: DataTypes.UUID, allowNull: true },
    branch_id: { type: DataTypes.UUID, allowNull: true },
    currency: { type: DataTypes.STRING(10), defaultValue: 'KWD' },
    notes: { type: DataTypes.TEXT },
    subtotal: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    tax_total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('draft', 'converted', 'cancelled'),
      defaultValue: 'draft',
    },
    converted_invoice_id: { type: DataTypes.UUID, allowNull: true }, // the Purchase Bill created from this PO
    created_by: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'purchase_orders',
    indexes: [{ unique: true, fields: ['company_id', 'po_no'] }],
  });
};
