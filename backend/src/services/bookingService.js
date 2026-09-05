// Fulfilling / cancelling an ItemBooking (see models/ItemBooking.js for the
// concept). Fulfilling is the moment stock actually leaves the warehouse for
// a previously-booked sale: it issues stock at the item's current
// weighted-average cost and posts the same Debit COGS / Credit Inventory
// journal entry that an ordinary (non-booked) sale posts immediately at
// invoice time — just deferred to now.
const { sequelize, ItemBooking } = require('../models');
const itemService = require('./itemService');
const voucherService = require('./voucherService');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound(message) { const e = new Error(message || 'Booking not found'); e.status = 404; return e; }

async function fulfillBooking(companyId, bookingId, userId, { date } = {}) {
  return sequelize.transaction(async (t) => {
    const booking = await ItemBooking.findOne({
      where: { id: bookingId, company_id: companyId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!booking) throw notFound();
    if (booking.status !== 'pending') throw badRequest('Only a pending booking can be fulfilled');

    const issueDate = date || new Date().toISOString().slice(0, 10);
    const { item, cogsAmount } = await itemService.issueStock(companyId, booking.item_id, {
      quantity: Number(booking.quantity),
      date: issueDate,
      referenceType: 'booking',
      referenceId: booking.id,
      userId,
      notes: 'Booked item delivered',
      branchId: booking.branch_id,
      variantId: booking.variant_id,
    }, t);

    if (cogsAmount > 0.0009) {
      const voucher = await voucherService.createVoucher(companyId, userId, {
        voucher_type: 'journal',
        date: issueDate,
        description: `Booked delivery - ${item.name_en}`,
        lines: [
          { account_id: item.cogs_account_id, debit: cogsAmount, credit: 0, description: `COGS - ${item.name_en} (booking delivered)` },
          { account_id: item.inventory_account_id, debit: 0, credit: cogsAmount, description: `COGS - ${item.name_en} (booking delivered)` },
        ],
      }, t);
      await voucherService.postVoucher(companyId, voucher.id, t);
    }

    await booking.update({ status: 'fulfilled', fulfilled_at: new Date() }, { transaction: t });
    return booking;
  });
}

async function cancelBooking(companyId, bookingId) {
  const booking = await ItemBooking.findOne({ where: { id: bookingId, company_id: companyId } });
  if (!booking) throw notFound();
  if (booking.status !== 'pending') throw badRequest('Only a pending booking can be cancelled');
  await booking.update({ status: 'cancelled' });
  return booking;
}

// Per-item booked-quantity totals (status='pending' only) — merged into the
// Items list/report alongside on-hand stock so "booked" vs. "available"
// (on-hand minus booked) is visible at a glance.
// Pass branchId to scope the total to bookings reserved at that specific
// branch only (used by the Items list's branch filter) — omit it for the
// company-wide total used everywhere else.
async function bookedQuantitiesByItem(companyId, branchId) {
  const where = { company_id: companyId, status: 'pending' };
  if (branchId) where.branch_id = branchId;
  const rows = await ItemBooking.findAll({
    attributes: ['item_id', [sequelize.fn('SUM', sequelize.col('quantity')), 'booked_qty']],
    where,
    group: ['item_id'],
    raw: true,
  });
  return new Map(rows.map((r) => [r.item_id, Number(r.booked_qty)]));
}

module.exports = { fulfillBooking, cancelBooking, bookedQuantitiesByItem };
