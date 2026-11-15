// Invoice movement: everything that ever happened to the goods and money of a sale —
// delivery, bookings, payments, returns/refunds, warranty replacements and exchanges —
// as a timeline plus a per-line "where did the items go" table. Also rolled up per client.
const { Op } = require('sequelize');
const {
  Invoice, InvoiceLine, InvoicePayment, ItemBooking, SalesReturn, SalesReturnLine, WarrantyClaim, Item, Client, SalesPerson, Branch,
} = require('../models');

const num = (v) => Number(v || 0);
const r3 = (v) => Math.round(num(v) * 1000) / 1000;
const day = (d) => (d ? String(d).slice(0, 10) : null);

async function invoiceMovement(companyId, invoiceId) {
  const inv = await Invoice.findOne({
    where: { id: invoiceId, company_id: companyId },
    include: [{ model: Client, as: 'client', attributes: ['id', 'name_en', 'name_ar'] }, { model: SalesPerson, as: 'salesperson', attributes: ['id', 'name_en', 'name_ar'] }, { model: Branch, as: 'branch', attributes: ['id', 'name_en', 'name_ar'] }],
  });
  if (!inv) return null;
  const [lines, payments, bookings, returns, claims] = await Promise.all([
    InvoiceLine.findAll({ where: { invoice_id: inv.id }, include: [{ model: Item, as: 'item', attributes: ['id', 'code', 'name_en', 'name_ar'] }], order: [['line_order', 'ASC']] }),
    InvoicePayment.findAll({ where: { invoice_id: inv.id }, order: [['date', 'ASC']] }),
    ItemBooking.findAll({ where: { invoice_id: inv.id } }),
    SalesReturn.findAll({ where: { invoice_id: inv.id }, include: [{ model: SalesReturnLine, as: 'lines' }], order: [['date', 'ASC']] }),
    WarrantyClaim.findAll({ where: { [Op.or]: [{ invoice_id: inv.id }, { new_invoice_id: inv.id }] }, order: [['created_at', 'ASC']] }),
  ]);

  const events = [];
  events.push({ at: day(inv.date), kind: 'invoice', title: `${inv.invoice_no}`, detail: inv.channel === 'pos' ? 'POS sale' : 'Sales invoice', amount: num(inv.total), ref: { type: 'invoice', id: inv.id } });
  payments.forEach((p) => events.push({ at: day(p.date), kind: 'payment', title: 'Payment', detail: p.payment_method, amount: num(p.amount) }));
  bookings.forEach((b) => {
    if (b.status === 'fulfilled') events.push({ at: day(b.fulfilled_at || b.updated_at), kind: 'delivery', title: 'Booked items delivered', detail: `${num(b.quantity)} unit(s)`, qty: num(b.quantity) });
    if (b.status === 'cancelled') events.push({ at: day(b.updated_at), kind: 'release', title: 'Booking released', detail: `${num(b.quantity)} unit(s) — ${b.notes || 'cancelled'}`, qty: num(b.quantity) });
    if (b.status === 'pending') events.push({ at: day(b.delivery_date || b.created_at), kind: 'booked', title: 'Booked — awaiting delivery', detail: `${num(b.quantity)} unit(s)`, qty: num(b.quantity) });
  });
  returns.forEach((r) => events.push({
    at: day(r.date), kind: 'return', title: `Return ${r.return_no}`, detail: `${r.lines.reduce((s, l) => s + num(l.quantity), 0)} unit(s)${r.stock_status === 'pending' ? ' — stock awaiting super admin' : ''}${r.reason ? ` — ${r.reason}` : ''}`,
    amount: -num(r.total), ref: { type: 'return', id: r.id },
  }));
  claims.forEach((c) => events.push({
    at: day(c.created_at || c.createdAt), kind: c.type, title: `${c.type === 'exchange' ? 'Exchange' : 'Warranty replacement'} ${c.claim_no}`,
    detail: `${num(c.quantity)} unit(s)${c.new_invoice_id === inv.id ? ' — new item sold here' : ''}${c.type === 'exchange' ? ` — difference ${r3(c.price_difference)}` : ''}`, amount: c.type === 'exchange' ? num(c.price_difference) : 0, ref: { type: 'claim', id: c.id },
  }));
  events.sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const lineRows = lines.map((l) => {
    const sold = num(l.quantity);
    const lb = bookings.filter((b) => b.invoice_line_id === l.id);
    const booked = lb.filter((b) => b.status === 'pending').reduce((s, b) => s + num(b.quantity), 0);
    const released = lb.filter((b) => b.status === 'cancelled').reduce((s, b) => s + num(b.quantity), 0);
    const delivered = l.is_booked ? lb.filter((b) => b.status === 'fulfilled').reduce((s, b) => s + num(b.quantity), 0) : (l.item_id ? sold : 0);
    const returnedQty = returns.reduce((s, r) => s + r.lines.filter((x) => x.invoice_line_id === l.id).reduce((a, x) => a + num(x.quantity), 0), 0);
    const physicalReturned = returns.reduce((s, r) => s + r.lines.filter((x) => x.invoice_line_id === l.id).reduce((a, x) => a + (num(x.quantity) - num(x.release_qty)), 0), 0);
    const replaced = claims.filter((c) => c.invoice_line_id === l.id && c.type === 'replacement').reduce((s, c) => s + num(c.quantity), 0);
    const exchanged = claims.filter((c) => c.invoice_line_id === l.id && c.type === 'exchange').reduce((s, c) => s + num(c.quantity), 0);
    return {
      id: l.id, code: l.item?.code || null, name_en: l.item?.name_en || l.description, name_ar: l.item?.name_ar || l.description, is_gift: !!l.is_gift, is_manufacture_item: !!l.manufacture_item_id,
      sold, delivered, booked_pending: booked, released, returned: returnedQty, physical_returned: physicalReturned, replaced, exchanged,
      with_client: Math.max(0, delivered - physicalReturned), warranty_expires: l.warranty_expires,
    };
  });

  return {
    invoice: {
      id: inv.id, invoice_no: inv.invoice_no, date: day(inv.date), status: inv.status, channel: inv.channel, total: num(inv.total), paid_total: num(inv.paid_total), returned_total: num(inv.returned_total),
      client: inv.client, salesperson: inv.salesperson, branch: inv.branch,
    },
    lines: lineRows,
    events,
  };
}

exports.invoice = async (req, res) => {
  const out = await invoiceMovement(req.companyId, req.params.id);
  if (!out) return res.status(404).json({ message: 'Invoice not found' });
  res.json(out);
};

// All sales of one client with their per-item movement; a flat timeline across invoices.
exports.client = async (req, res) => {
  const { from, to } = req.query;
  const where = { company_id: req.companyId, client_id: req.params.clientId, type: 'sales', status: { [Op.ne]: 'draft' } };
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  const invs = await Invoice.findAll({ where, order: [['date', 'DESC']], limit: 200, attributes: ['id'] });
  const client = await Client.findOne({ where: { id: req.params.clientId, company_id: req.companyId }, attributes: ['id', 'name_en', 'name_ar'] });
  const parts = (await Promise.all(invs.map((i) => invoiceMovement(req.companyId, i.id)))).filter(Boolean);
  const sum = (k) => parts.reduce((s, p) => s + p.lines.reduce((a, l) => a + l[k], 0), 0);
  const events = parts.flatMap((p) => p.events.map((e) => ({ ...e, invoice_no: p.invoice.invoice_no, invoice_id: p.invoice.id }))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  res.json({
    client,
    totals: {
      invoices: parts.length, sold: sum('sold'), delivered: sum('delivered'), booked_pending: sum('booked_pending'), returned: sum('returned'), replaced: sum('replaced'), exchanged: sum('exchanged'),
      billed: r3(parts.reduce((s, p) => s + p.invoice.total, 0)), returned_value: r3(parts.reduce((s, p) => s + p.invoice.returned_total, 0)), paid: r3(parts.reduce((s, p) => s + p.invoice.paid_total, 0)),
    },
    invoices: parts.map((p) => ({ ...p.invoice, lines: p.lines })),
    events,
  });
};
