// A quantity of an Item reserved for a client from a "booked" sales invoice
// line — the client bought it but wants delivery on a later date, so the
// stock stays fully counted in on-hand inventory until it's actually handed
// over. This row is what lets the super admin see, separately from raw
// on-hand quantity: how much of an item's stock is already spoken for
// (booked) vs. genuinely free to sell (available).
//
// status: 'pending' (reserved, not yet delivered), 'fulfilled' (delivered —
// stock was then actually issued via itemService.issueStock, COGS posted),
// 'cancelled' (the order fell through, or its parent invoice was cancelled —
// the reservation is released without ever touching stock).
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ItemBooking', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    item_id: { type: DataTypes.UUID, allowNull: false },
    variant_id: { type: DataTypes.UUID, allowNull: true },
    branch_id: { type: DataTypes.UUID, allowNull: true },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    invoice_line_id: { type: DataTypes.UUID, allowNull: false },
    client_id: { type: DataTypes.UUID, allowNull: true },
    quantity: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    delivery_date: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'fulfilled', 'cancelled'), defaultValue: 'pending' },
    fulfilled_at: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.STRING(255), allowNull: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
  }, {
    tableName: 'item_bookings',
  });
};
