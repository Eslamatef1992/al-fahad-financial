const { Op, QueryTypes } = require('sequelize');
const {
  sequelize, Invoice, InvoiceLine, InvoicePayment, Client, Branch, Manufacturer, User, PosShift,
} = require('../models');

const STATUSES = ['ordered', 'in_production', 'ready', 'delivered'];
const r3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

// Stock (COGS) cost actually issued for each invoice: direct sale movements, plus
// movements from booked lines that were fulfilled later (those reference the booking).
async function stockCostByInvoice(companyId, invoiceIds) {
  if (!invoiceIds.length) return new Map();
  const rows = await sequelize.query(
    `SELECT inv_id, SUM(cost) AS cost FROM (
       SELECT t.reference_id AS inv_id, -t.quantity * t.unit_cost AS cost
         FROM inventory_transactions t
        WHERE t.company_id = :companyId AND t.type = 'sale' AND t.reference_type = 'invoice' AND t.reference_id IN (:ids)
       UNION ALL
       SELECT b.invoice_id AS inv_id, -t.quantity * t.unit_cost AS cost
         FROM inventory_transactions t JOIN item_bookings b ON b.id = t.reference_id
        WHERE t.company_id = :companyId AND t.type = 'sale' AND t.reference_type = 'booking' AND b.invoice_id IN (:ids)
     ) x GROUP BY inv_id`,
    { replacements: { companyId, ids: invoiceIds }, type: QueryTypes.SELECT },
  );
  return new Map(rows.map((r) => [r.inv_id, Number(r.cost)]));
}

function shape(inv, stockCost) {
  const revenue = Number(inv.subtotal || 0); // net of discounts, before tax
  const mfg = Number(inv.manufacture_cost || 0);
  const totalCost = stockCost + mfg;
  const profit = revenue - totalCost;
  return {
    id: inv.id,
    invoice_no: inv.invoice_no,
    date: inv.date,
    status: inv.status,
    channel: inv.channel,
    branch_id: inv.branch_id,
    branch: inv.branch ? { id: inv.branch.id, code: inv.branch.code, name_en: inv.branch.name_en, name_ar: inv.branch.name_ar } : null,
    client: inv.client ? { id: inv.client.id, name_en: inv.client.name_en, name_ar: inv.client.name_ar, phone: inv.client.phone } : null,
    manufacturer_id: inv.manufacturer_id,
    manufacturer: inv.manufacturer ? { id: inv.manufacturer.id, name_en: inv.manufacturer.name_en, name_ar: inv.manufacturer.name_ar } : null,
    created_by: inv.created_by,
    cashier: inv.creator ? inv.creator.name : null,
    delivery_date: inv.delivery_date,
    attachments: inv.attachments || [],
    manufacture_status: inv.manufacture_status || 'ordered',
    manufacture_cost: r3(mfg),
    manufacture_notes: inv.manufacture_notes || '',
    total: r3(inv.total),
    paid_total: r3(inv.paid_total),
    discount_amount: r3(inv.discount_amount),
    revenue: r3(revenue),
    stock_cost: r3(stockCost),
    total_cost: r3(totalCost),
    profit: r3(profit),
    margin_pct: revenue > 0 ? r3((profit / revenue) * 100) : null,
  };
}

const baseInclude = [
  { model: Client, as: 'client' },
  { model: Branch, as: 'branch' },
  { model: Manufacturer, as: 'manufacturer' },
  { model: User, as: 'creator', attributes: ['id', 'name'] },
];

exports.list = async (req, res) => {
  const { from, to, branch_id, manufacturer_id, status, include_cancelled } = req.query;
  const where = { company_id: req.companyId, type: 'sales', is_manufacture_order: true };
  if (include_cancelled !== 'true') where.status = { [Op.ne]: 'cancelled' };
  if (branch_id) where.branch_id = branch_id;
  if (manufacturer_id) where.manufacturer_id = manufacturer_id;
  if (status && STATUSES.includes(status)) where.manufacture_status = status;
  if (from || to) where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };

  const invoices = await Invoice.findAll({ where, include: baseInclude, order: [['date', 'DESC'], ['created_at', 'DESC']] });
  const costs = await stockCostByInvoice(req.companyId, invoices.map((i) => i.id));
  const rows = invoices.map((i) => shape(i, costs.get(i.id) || 0));
  const live = rows.filter((r) => r.status !== 'cancelled');
  const sum = (k) => r3(live.reduce((s, r) => s + r[k], 0));
  const revenue = sum('revenue');
  res.json({
    rows,
    totals: {
      count: live.length, revenue, stock_cost: sum('stock_cost'), manufacture_cost: sum('manufacture_cost'),
      total_cost: sum('total_cost'), profit: sum('profit'), paid_total: sum('paid_total'),
      margin_pct: revenue > 0 ? r3((sum('profit') / revenue) * 100) : null,
    },
  });
};

// Full drill-down for one order: header numbers + each line with its stock cost
// and margin, the payments, attachments and the shift it was rung up in.
exports.get = async (req, res) => {
  const inv = await Invoice.findOne({
    where: { id: req.params.id, company_id: req.companyId, type: 'sales', is_manufacture_order: true },
    include: [
      ...baseInclude,
      { model: InvoiceLine, as: 'lines' },
      { model: InvoicePayment, as: 'payments' },
      { model: PosShift, as: 'posShift' },
    ],
  });
  if (!inv) return res.status(404).json({ message: 'Manufacture order not found' });

  const costs = await stockCostByInvoice(req.companyId, [inv.id]);
  const lineCosts = await sequelize.query(
    `SELECT t.item_id, SUM(-t.quantity * t.unit_cost) AS cost FROM (
       SELECT item_id, quantity, unit_cost FROM inventory_transactions
        WHERE company_id = :companyId AND type = 'sale' AND reference_type = 'invoice' AND reference_id = :id
       UNION ALL
       SELECT t2.item_id, t2.quantity, t2.unit_cost FROM inventory_transactions t2 JOIN item_bookings b ON b.id = t2.reference_id
        WHERE t2.company_id = :companyId AND t2.type = 'sale' AND t2.reference_type = 'booking' AND b.invoice_id = :id
     ) t GROUP BY t.item_id`,
    { replacements: { companyId: req.companyId, id: inv.id }, type: QueryTypes.SELECT },
  );
  const costByItem = new Map(lineCosts.map((r) => [r.item_id, Number(r.cost)]));

  const lines = [...inv.lines].sort((a, b) => a.line_order - b.line_order).map((l) => {
    const revenue = Number(l.line_subtotal || 0);
    // item cost is per item; if the same item is on several lines, split by quantity share
    const sameItemQty = inv.lines.filter((x) => x.item_id === l.item_id).reduce((s, x) => s + Number(x.quantity), 0) || 1;
    const cost = l.item_id ? (costByItem.get(l.item_id) || 0) * (Number(l.quantity) / sameItemQty) : 0;
    return {
      id: l.id, item_id: l.item_id, description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price),
      discount_amount: Number(l.discount_amount || 0), revenue: r3(revenue), cost: r3(cost), profit: r3(revenue - cost),
      is_booked: !!l.is_booked, delivery_date: l.delivery_date,
    };
  });

  res.json({
    order: shape(inv, costs.get(inv.id) || 0),
    lines,
    payments: inv.payments.map((p) => ({ id: p.id, date: p.date, amount: Number(p.amount), payment_method: p.payment_method, reference: p.reference })),
    notes: inv.notes,
    delivery_address: inv.delivery_address,
    reference_no: inv.reference_no,
    shift: inv.posShift ? { id: inv.posShift.id, opened_at: inv.posShift.opened_at, status: inv.posShift.status } : null,
  });
};

exports.update = async (req, res) => {
  const inv = await Invoice.findOne({
    where: { id: req.params.id, company_id: req.companyId, type: 'sales', is_manufacture_order: true },
  });
  if (!inv) return res.status(404).json({ message: 'Manufacture order not found' });
  const { manufacture_cost, manufacture_status, manufacture_notes, manufacturer_id } = req.body;
  const patch = {};
  if (manufacture_cost !== undefined) {
    const c = Number(manufacture_cost || 0);
    if (!Number.isFinite(c) || c < 0) return res.status(400).json({ message: 'manufacture_cost must be 0 or more' });
    patch.manufacture_cost = c;
  }
  if (manufacture_status !== undefined) {
    if (!STATUSES.includes(manufacture_status)) return res.status(400).json({ message: `manufacture_status must be one of ${STATUSES.join(', ')}` });
    patch.manufacture_status = manufacture_status;
  }
  if (manufacture_notes !== undefined) patch.manufacture_notes = String(manufacture_notes || '').slice(0, 2000) || null;
  if (manufacturer_id !== undefined) {
    if (manufacturer_id) {
      const m = await Manufacturer.findOne({ where: { id: manufacturer_id, company_id: req.companyId } });
      if (!m) return res.status(400).json({ message: 'Unknown manufacturer' });
    }
    patch.manufacturer_id = manufacturer_id || null;
  }
  await inv.update(patch);
  res.json({ id: inv.id, ...patch });
};
