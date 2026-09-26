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
    // Free-text label of how this payment was tendered (e.g. "Cash", "Knet",
    // a payment method's own name_en, or "credit"). Was a fixed ENUM; widened
    // to a plain string once payment methods became an admin-configurable
    // list (Payment Setting Options) rather than a hardcoded set. Defaults to
    // 'cash' so every payment recorded before this existed reads unchanged.
    payment_method: { type: DataTypes.STRING(60), defaultValue: 'cash' },
    // Which configured PaymentMethod this was, if any — nullable because
    // older payments and the special 'credit' tender have none.
    payment_method_id: { type: DataTypes.UUID, allowNull: true },
    reference: { type: DataTypes.STRING(60) }, // e.g. Knet approval/reference code
  }, { tableName: 'invoice_payments' });
};
