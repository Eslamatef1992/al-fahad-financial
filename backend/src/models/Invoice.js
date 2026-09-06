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
    branch_id: { type: DataTypes.UUID, allowNull: true },
    tax_account_id: { type: DataTypes.UUID, allowNull: true }, // where line tax amounts post to, if any
    // When this order should be delivered to the client — independent of the
    // per-line "book for later" reservation (which holds stock). A sale can
    // carry a delivery date/address without reserving stock at all (e.g. it
    // ships from on-hand inventory next week), and a booked line can still
    // carry its own separate delivery_date for exactly when its reservation
    // is fulfilled. This pair is what the Delivery Schedule report reads.
    delivery_date: { type: DataTypes.DATEONLY, allowNull: true },
    delivery_address: { type: DataTypes.TEXT, allowNull: true },
    // Purely a tag — checking "Manufacture Order" on a POS sale and picking a
    // manufacturer does not trigger any purchasing flow, it just marks this
    // sale as tied to that manufacturer for later filtering/reporting.
    is_manufacture_order: { type: DataTypes.BOOLEAN, defaultValue: false },
    manufacturer_id: { type: DataTypes.UUID, allowNull: true },
    currency: { type: DataTypes.STRING(10), defaultValue: 'KWD' },
    notes: { type: DataTypes.TEXT },
    discount_code_id: { type: DataTypes.UUID, allowNull: true }, // set only for an invoice-scoped code; its amount is allocated across lines
    discount_amount: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 }, // total discount across the whole invoice (header + all line codes), for display
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
    // Set when this invoice was rung up from the POS screen rather than the
    // regular back-office Sales Invoices page. A POS sale is a normal sales
    // Invoice underneath — same posting/payment pipeline — just tagged with
    // where it came from and which cashier shift it belongs to.
    channel: { type: DataTypes.ENUM('backoffice', 'pos'), defaultValue: 'backoffice' },
    pos_shift_id: { type: DataTypes.UUID, allowNull: true },
    // A refunded sale reuses status:'cancelled' (its GL/stock effect is the
    // same either way — fully reversed) rather than adding a new ENUM value,
    // since altering an existing Postgres ENUM type under the production
    // sync({alter:true}) path is fragile. These fields are what distinguish
    // "refunded" from a plain pre-payment void/cancel.
    refunded_at: { type: DataTypes.DATE, allowNull: true },
    refund_reason: { type: DataTypes.STRING(255), allowNull: true },
    refunded_by: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'invoices',
    indexes: [{ unique: true, fields: ['company_id', 'type', 'invoice_no'] }],
  });
};
