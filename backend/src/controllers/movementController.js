// Invoice movement: everything that ever happened to the goods and money of a sale —
// delivery, bookings, payments, returns/refunds, warranty replacements and exchanges —
// as a timeline plus a per-line "where did the items go" table. Also rolled up per client.
const { Op } = require('sequelize');
const {
  Invoice, InvoiceLine, InvoicePayment, ItemBooking, SalesReturn, SalesReturnLine, WarrantyClaim, Item, Client, SalesPerson, Branch,
} = require('../models');

const num = (v) => Number(v || 0);
const r3 = (v) => Math.round(num(v) * 1000) / 1000;
const day = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null);

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

// Find a client by phone number / name, or an invoice by number (which leads to its client).
exports.search = async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ clients: [], invoices: [] });
  const digits = q.replace(/[^\d]/g, '');
  const like = { [Op.iLike]: `%${q}%` };
  const clients = await Client.findAll({
    where: { company_id: req.companyId, [Op.or]: [{ name_en: like }, { name_ar: like }, { code: like }, { phone: like }, ...(digits.length >= 3 ? [{ phone: { [Op.iLike]: `%${digits}%` } }] : [])] },
    attributes: ['id', 'code', 'name_en', 'name_ar', 'phone'], limit: 10,
  });
  const invoices = await Invoice.findAll({
    where: { company_id: req.companyId, type: 'sales', status: { [Op.ne]: 'draft' }, invoice_no: like },
    include: [{ model: Client, as: 'client', attributes: ['id', 'name_en', 'name_ar', 'phone'] }], attributes: ['id', 'invoice_no', 'date', 'total', 'client_id'], order: [['date', 'DESC']], limit: 10,
  });
  res.json({ clients, invoices });
};

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


// ---- Item movement: the full life of one item, oldest -> newest, with a running stock balance ----
// Opening / purchases / sales / deliveries of booked goods / returns / warranty replacements /
// transfers / damages / manual adjustments, each linked to its document, plus booking events.
exports.item = async (req, res) => {
  const { InventoryTransaction, ItemDamage, StockTransfer, Supplier, User } = require('../models');
  const SalesReturnLineM = require('../models').SalesReturnLine;
  const companyId = req.companyId;
  const item = await Item.findOne({ where: { id: req.params.itemId, company_id: companyId }, attributes: ['id', 'code', 'name_en', 'name_ar', 'unit', 'selling_price', 'created_at'] });
  if (!item) return res.status(404).json({ message: 'Item not found' });

  const [tx, bookings, damages, branches] = await Promise.all([
    InventoryTransaction.findAll({ where: { item_id: item.id, company_id: companyId }, order: [['date', 'ASC'], ['createdAt', 'ASC']] }),
    ItemBooking.findAll({ where: { item_id: item.id, company_id: companyId }, order: [['createdAt', 'ASC']] }),
    ItemDamage.findAll({ where: { item_id: item.id, company_id: companyId }, order: [['createdAt', 'ASC']] }),
    Branch.findAll({ where: { company_id: companyId }, attributes: ['id', 'name_en', 'name_ar'] }),
  ]);
  const retLines = await SalesReturnLineM.findAll({ where: { item_id: item.id }, include: [{ model: SalesReturn, as: 'salesReturn', required: true, where: { company_id: companyId }, include: [{ model: Client, as: 'client', attributes: ['name_en'] }] }] });
  const retByNo = new Map(retLines.map((l) => [l.salesReturn.return_no, l.salesReturn]));
  const bName = new Map(branches.map((b) => [b.id, b.name_en]));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  const invIds = new Set(bookings.map((b) => b.invoice_id));
  tx.forEach((t) => { if (t.reference_type === 'invoice' && t.reference_id) invIds.add(t.reference_id); });
  const invoices = invIds.size ? await Invoice.findAll({ where: { id: { [Op.in]: [...invIds] }, company_id: companyId }, include: [{ model: Client, as: 'client', attributes: ['name_en'] }, { model: Supplier, as: 'supplier', attributes: ['name_en'] }] }) : [];
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const transferIds = tx.filter((t) => t.reference_type === 'transfer' && t.reference_id).map((t) => t.reference_id);
  const transfers = transferIds.length ? await StockTransfer.findAll({ where: { id: { [Op.in]: transferIds } }, attributes: ['id', 'transfer_no'] }) : [];
  const trById = new Map(transfers.map((t) => [t.id, t.transfer_no]));
  const userIds = [...new Set([...tx.map((t) => t.created_by), ...bookings.map((b) => b.created_by)].filter(Boolean))];
  const users = userIds.length ? await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'name'] }) : [];
  const uName = new Map(users.map((u) => [u.id, u.name]));

  const events = [];
  tx.forEach((t) => {
    const qty = num(t.quantity);
    const notes = t.notes || '';
    let inv = t.reference_type === 'invoice' ? invById.get(t.reference_id) : null;
    if (t.reference_type === 'booking') inv = invById.get(bookingById.get(t.reference_id)?.invoice_id) || null;
    let kind; let label;
    if (t.type === 'opening') { kind = 'opening'; label = 'Opening balance'; }
    else if (t.type === 'purchase_receipt') { kind = 'purchase'; label = 'Purchase received'; }
    else if (t.type === 'transfer_in') { kind = 'transfer'; label = 'Transfer in'; }
    else if (t.type === 'transfer_out') { kind = 'transfer'; label = 'Transfer out'; }
    else if (t.type === 'sale') { kind = t.reference_type === 'booking' ? 'delivery' : 'sale'; label = t.reference_type === 'booking' ? 'Booked item delivered' : 'Sale'; }
    else if (/^Return /i.test(notes)) { kind = 'return'; label = 'Customer return (back to stock)'; }
    else if (/^Refund of/i.test(notes)) { kind = 'return'; label = 'Refund / cancelled sale (back to stock)'; }
    else if (t.reference_type === 'warranty') { kind = 'warranty'; label = 'Warranty replacement'; }
    else if (t.reference_type === 'damage') { kind = 'damage'; label = 'Damage written off'; }
    else { kind = 'adjustment'; label = 'Stock adjustment'; }
    const party = inv ? (inv.type === 'sales' ? inv.client?.name_en : inv.supplier?.name_en) : null;
    const retNo = (notes.match(/RET-\d+/) || [])[0];
    const retDoc = retNo && retByNo.get(retNo) ? { type: 'return', id: retByNo.get(retNo).id, no: retNo } : null;
    events.push({
      at: day(t.date), ts: t.createdAt, kind, label, stock: true, qty,
      doc: retDoc || (inv ? { type: 'invoice', id: inv.id, no: inv.invoice_no } : t.reference_type === 'transfer' && trById.get(t.reference_id) ? { type: 'transfer', id: t.reference_id, no: trById.get(t.reference_id) } : null),
      party: party || (retNo && retByNo.get(retNo)?.client?.name_en) || null, branch: t.branch_id ? bName.get(t.branch_id) || null : 'Main store', unit_cost: num(t.unit_cost), notes, user: uName.get(t.created_by) || null,
    });
  });
  bookings.forEach((b) => {
    const inv = invById.get(b.invoice_id);
    const doc = inv ? { type: 'invoice', id: inv.id, no: inv.invoice_no } : null;
    events.push({ at: day(b.createdAt), ts: b.createdAt, kind: 'booked', label: 'Booked for client (stock stays in store)', stock: false, qty: num(b.quantity), doc, party: inv?.client?.name_en || null, branch: 'Main store', notes: b.delivery_date ? `Delivery ${day(b.delivery_date)}` : '', user: uName.get(b.created_by) || null });
    if (b.status === 'cancelled') events.push({ at: day(b.updatedAt), ts: b.updatedAt, kind: 'released', label: 'Booking released (back to available)', stock: false, qty: num(b.quantity), doc, party: inv?.client?.name_en || null, branch: 'Main store', notes: '' });
  });
  retLines.forEach((l) => {
    const sr = l.salesReturn;
    const how = sr.refund_method === 'credit' ? 'client credit' : sr.refund_method;
    events.push({
      at: day(sr.date), ts: sr.createdAt, kind: 'refund', label: `Refund ${sr.return_no} — ${l.disposition === 'damaged' ? 'damaged (written off)' : 'back to stock'}`, stock: false, qty: num(l.quantity),
      doc: { type: 'return', id: sr.id, no: sr.return_no }, party: sr.client?.name_en || null, branch: 'Main store',
      notes: `Value ${num(l.line_total).toFixed(3)} · via ${how}${num(l.release_qty) > 0 ? ` · ${num(l.release_qty)} booked units released` : ''} · stock ${l.stock_status}`,
    });
  });
  damages.filter((d) => d.status === 'reported').forEach((d) => events.push({ at: day(d.createdAt), ts: d.createdAt, kind: 'damage', label: `Damage reported (${d.damage_type})`, stock: false, qty: num(d.quantity), doc: null, party: null, branch: d.branch_id ? bName.get(d.branch_id) : 'Main store', notes: d.notes || '' }));

  events.sort((a, b) => String(a.at).localeCompare(String(b.at)) || new Date(a.ts) - new Date(b.ts));
  let bal = 0; let totalIn = 0; let totalOut = 0;
  events.forEach((e) => {
    if (e.stock) { bal = r3(bal + e.qty); if (e.qty > 0) totalIn += e.qty; else totalOut += -e.qty; }
    e.balance = bal;
  });
  const pending = bookings.filter((b) => b.status === 'pending').reduce((s, b) => s + num(b.quantity), 0);
  res.json({
    item: { id: item.id, code: item.code, name_en: item.name_en, name_ar: item.name_ar, unit: item.unit, selling_price: num(item.selling_price) },
    summary: { total_in: r3(totalIn), total_out: r3(totalOut), on_hand: bal, booked: r3(pending), available: r3(bal - pending), first: events[0]?.at || null, last: events.length ? events[events.length - 1].at : null },
    events,
  });
};
