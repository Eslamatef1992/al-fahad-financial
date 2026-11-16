const { Op } = require('sequelize');
const { ItemBooking, Item, ItemVariant, Branch, Invoice, InvoiceLine, Client } = require('../models');
const bookingService = require('../services/bookingService');

const include = [
  { model: Item, as: 'item' },
  { model: ItemVariant, as: 'variant' },
  { model: Branch, as: 'branch' },
  { model: Invoice, as: 'invoice' },
  { model: Client, as: 'client' },
];

// Self-heal: a posted sales invoice's "booked" line that somehow has no booking row at all
// (never created, or lost) gets its pending booking (re)created, so it always shows up here.
async function backfillMissingBookings(companyId) {
  const lines = await InvoiceLine.findAll({
    where: { is_booked: true, item_id: { [Op.ne]: null } },
    include: [{ model: Invoice, as: 'invoice', required: true, where: { company_id: companyId, type: 'sales', status: { [Op.in]: ['posted', 'partially_paid', 'paid'] } } }],
  });
  if (!lines.length) return;
  const have = new Set((await ItemBooking.findAll({ where: { company_id: companyId, invoice_line_id: { [Op.in]: lines.map((l) => l.id) } }, attributes: ['invoice_line_id'], raw: true })).map((r) => r.invoice_line_id));
  for (const l of lines) {
    if (have.has(l.id)) continue;
    const left = Number(l.quantity) - Number(l.delivered_qty || 0);
    if (left <= 0.0005) continue;
    await ItemBooking.create({
      company_id: companyId, item_id: l.item_id, variant_id: l.variant_id || null, branch_id: null, invoice_id: l.invoice_id, invoice_line_id: l.id,
      client_id: l.invoice.client_id || null, quantity: left, delivery_date: l.delivery_date || l.invoice.delivery_date || null, status: 'pending',
    });
  }
}

exports.list = async (req, res) => {
  const { status } = req.query;
  await backfillMissingBookings(req.companyId).catch(() => {});
  const where = { company_id: req.companyId };
  if (status && status !== 'all') where.status = status;
  else if (!status) where.status = 'pending'; // default view: what's currently booked
  const rows = await ItemBooking.findAll({ where, include, order: [['delivery_date', 'ASC'], ['createdAt', 'ASC']] });
  res.json(rows);
};

exports.fulfill = async (req, res) => {
  const booking = await bookingService.fulfillBooking(req.companyId, req.params.id, req.user.id, req.body);
  const withRel = await ItemBooking.findByPk(booking.id, { include });
  res.json(withRel);
};

exports.cancel = async (req, res) => {
  const booking = await bookingService.cancelBooking(req.companyId, req.params.id);
  const withRel = await ItemBooking.findByPk(booking.id, { include });
  res.json(withRel);
};
