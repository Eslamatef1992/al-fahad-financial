// Links a payment (posted receipt/payment Voucher) to the invoice it settles,
// so an invoice can be partially or fully paid across multiple vouchers.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('InvoicePayment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    voucher_id: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.TEXT },
    // How this payment was tendered. Defaults to 'cash' so every payment
    // recorded before this field existed reads exactly as before.
    payment_method: { type: DataTypes.ENUM('cash', 'knet', 'bank', 'other'), defaultValue: 'cash' },
    reference: { type: DataTypes.STRING(60) }, // e.g. Knet approval/reference code
  }, { tableName: 'invoice_payments' });
};
