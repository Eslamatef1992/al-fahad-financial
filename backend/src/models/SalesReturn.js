// A Sales Return (credit note): goods/amounts given back against a posted sales
// invoice — all of it or just some lines/quantities. Each return posts its own
// reversing journal voucher, optionally restocks the goods, and settles the money
// (offset against what the client still owes, then cash/KNET back, or left as
// client credit). The original invoice is never edited — returns stack on it.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('SalesReturn', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    return_no: { type: DataTypes.STRING(30), allowNull: false },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    client_id: { type: DataTypes.UUID, allowNull: true },
    branch_id: { type: DataTypes.UUID, allowNull: true },
    pos_shift_id: { type: DataTypes.UUID, allowNull: true }, // cashier shift, when processed from POS
    date: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    tax_total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },
    // How the returned amount was settled:
    applied_to_invoice: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 }, // reduced the unpaid balance
    applied_to_other: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },   // credit used to pay another invoice (exchange)
    settled_invoice_id: { type: DataTypes.UUID, allowNull: true },
    refunded_amount: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },    // paid back out (cash/KNET)
    credited_amount: { type: DataTypes.DECIMAL(18, 3), defaultValue: 0 },    // left as client credit
    refund_method: { type: DataTypes.STRING(20), allowNull: true },          // cash | knet | other | credit
    // Returned goods re-enter sellable stock only after a super admin confirms them:
    // none (nothing physical came back) | pending | confirmed
    stock_status: { type: DataTypes.STRING(10), defaultValue: 'none' },
    stock_confirmed_by: { type: DataTypes.UUID, allowNull: true },
    stock_confirmed_at: { type: DataTypes.DATE, allowNull: true },
    stock_voucher_id: { type: DataTypes.UUID, allowNull: true },
    voucher_id: { type: DataTypes.UUID, allowNull: true },
    refund_voucher_id: { type: DataTypes.UUID, allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
  }, { tableName: 'sales_returns', indexes: [{ unique: true, fields: ['company_id', 'return_no'] }] });
};
