// Unified invoice model for both Sales Invoices (to clients) and Purchase
// Invoices/Bills (from suppliers). `type` determines which party field and
// which side of the ledger (AR+Revenue vs AP+Expense) posting uses.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Invoice', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM('sales', 'purchase'), allowNull: false },
    client_id: { type: DataTypes.UUID, allowNull: true },   // sales invoices
    supplier_id: { type: DataTypes.UUID, allowNull: true }, // purchase invoices
    invoice_no: { type: DataTypes.STRING(30), allowNull: false },
    reference_no: { type: DataTypes.STRING(60) }, // supplier's own bill number, PO number, etc.
    date: { type: DataTypes.DATEONLY, allowNull: false },
    due_date: { type: DataTypes.DATEONLY, allowNull: true },
    cost_center_id: { type: DataTypes.UUID, allowNull: true },
    tax_account_id: { type: DataTypes.UUID, allowNull: true }, // where line tax amounts post to, if any
    currency: { type: DataTypes.STRING(10), defaultValue: 'KWD' },
    notes: { type: DataTypes.TEXT },
    subtotal: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    tax_total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    paid_total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('draft', 'posted', 'partially_paid', 'paid', 'cancelled'),
      defaultValue: 'draft',
    },
    recurring_invoice_id: { type: DataTypes.UUID, allowNull: true }, // set if generated from a template
    posting_voucher_id: { type: DataTypes.UUID, allowNull: true }, // the journal voucher created when posted (for cancellation)
    created_by: { type: DataTypes.UUID, allowNull: true },
    posted_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'invoices',
    indexes: [{ unique: true, fields: ['company_id', 'type', 'invoice_no'] }],
  });
};
