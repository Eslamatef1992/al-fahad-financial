const { ItemBooking, Item, ItemVariant, Branch, Invoice, Client } = require('../models');
const bookingService = require('../services/bookingService');

const include = [
  { model: Item, as: 'item' },
  { model: ItemVariant, as: 'variant' },
  { model: Branch, as: 'branch' },
  { model: Invoice, as: 'invoice' },
  { model: Client, as: 'client' },
];

exports.list = async (req, res) => {
  const { status } = req.query;
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
