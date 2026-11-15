// Inventory dashboard + the standard stock report set (summary, valuation,
// movement, in/out, low/out of stock, adjustments, expiry, damaged, product
// ledger, warehouse stock). Pure SQL aggregation over the stock tables so it
// stays fast regardless of item count. Every report returns { rows, totals }.
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const q = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const num = (v) => Number(v || 0);

// One row per (item, variant?, branch?) stock location. branch_id NULL = the
// unbranched main-store pool.
const STOCK_CTE = `
  stock AS (
    SELECT i.id AS item_id, NULL::uuid AS branch_id, i.quantity_on_hand AS qty, i.cost_price AS cost
      FROM items i WHERE i.company_id = :c AND i.is_active
    UNION ALL
    SELECT v.item_id, NULL::uuid, v.quantity_on_hand, v.cost_price
      FROM item_variants v WHERE v.company_id = :c AND v.is_active
    UNION ALL
    SELECT s.item_id, s.branch_id, s.quantity_on_hand, s.cost_price
      FROM item_branch_stocks s WHERE s.company_id = :c
    UNION ALL
    SELECT v.item_id, s.branch_id, s.quantity_on_hand, s.cost_price
      FROM item_variant_branch_stocks s JOIN item_variants v ON v.id = s.variant_id WHERE s.company_id = :c
  )`;

function branchFilter(branchId, col = 's.branch_id') {
  if (!branchId) return '';
  return branchId === 'pool' ? ` AND ${col} IS NULL` : ` AND ${col} = :b`;
}

// Item-level stock rows (qty/value summed across the chosen locations + booked).
async function itemStockRows(companyId, branchId) {
  return q(`
    WITH ${STOCK_CTE},
    agg AS (
      SELECT s.item_id, SUM(s.qty) AS qty, SUM(s.qty * s.cost) AS value
        FROM stock s WHERE 1=1 ${branchFilter(branchId)} GROUP BY s.item_id
    ),
    bk AS (
      SELECT item_id, SUM(quantity) AS booked FROM item_bookings
       WHERE company_id = :c AND status = 'pending' ${branchId && branchId !== 'pool' ? 'AND branch_id = :b' : ''} GROUP BY item_id
    )
    SELECT i.id AS item_id, i.code, i.name_en, i.name_ar, i.unit, i.reorder_level, i.selling_price, i.expiry_date,
           COALESCE(a.qty, 0) AS qty, COALESCE(a.value, 0) AS value, COALESCE(b.booked, 0) AS booked
      FROM items i
      LEFT JOIN agg a ON a.item_id = i.id
      LEFT JOIN bk b ON b.item_id = i.id
     WHERE i.company_id = :c AND i.is_active AND COALESCE(i.item_type, 'stock') <> 'service'
     ORDER BY i.code`, { c: companyId, b: branchId });
}

const withAvail = (r) => ({
  ...r, qty: num(r.qty), value: num(r.value), booked: num(r.booked), reorder_level: num(r.reorder_level),
  available: num(r.qty) - num(r.booked), avg_cost: num(r.qty) > 0 ? num(r.value) / num(r.qty) : 0,
});

exports.dashboard = async (req, res) => {
  const c = req.companyId;
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 1), 730);
  const items = (await itemStockRows(c, null)).map(withAvail);

  const sum = (k) => items.reduce((s, r) => s + r[k], 0);
  const lowRows = items.filter((r) => r.reorder_level > 0 && r.qty <= r.reorder_level && r.qty > 0);
  const outRows = items.filter((r) => r.qty <= 0);

  const mostSelling = await q(`
    SELECT i.id AS item_id, i.code, i.name_en, i.name_ar, SUM(l.quantity) AS sold, SUM(l.line_subtotal) AS revenue
      FROM invoice_lines l
      JOIN invoices inv ON inv.id = l.invoice_id
      JOIN items i ON i.id = l.item_id
     WHERE inv.company_id = :c AND inv.type = 'sales' AND inv.status NOT IN ('draft', 'cancelled')
       AND inv.date >= CURRENT_DATE - (:d || ' days')::interval
     GROUP BY i.id, i.code, i.name_en, i.name_ar
     ORDER BY sold DESC LIMIT 10`, { c, d: String(days) });

  const perBranch = await q(`
    WITH ${STOCK_CTE}
    SELECT s.branch_id, COALESCE(b.name_en, 'Main store') AS name_en, COALESCE(b.name_ar, 'المخزن الرئيسي') AS name_ar,
           SUM(s.qty) AS qty, SUM(s.qty * s.cost) AS value
      FROM stock s LEFT JOIN branches b ON b.id = s.branch_id
     GROUP BY s.branch_id, b.name_en, b.name_ar
    HAVING SUM(s.qty) <> 0 ORDER BY value DESC`, { c });

  const top = (arr, k, n) => [...arr].sort((a, b) => b[k] - a[k]).slice(0, n);
  res.json({
    days,
    totals: {
      total_products: items.length, total_qty: sum('qty'), stock_value: sum('value'),
      total_booked: sum('booked'), total_available: sum('available'),
      low_stock_count: lowRows.length, out_of_stock_count: outRows.length,
    },
    stock_per_item: top(items, 'qty', 10).map((r) => ({ code: r.code, name_en: r.name_en, name_ar: r.name_ar, qty: r.qty, available: r.available, booked: r.booked })),
    most_selling: mostSelling.map((r) => ({ ...r, sold: num(r.sold), revenue: num(r.revenue) })),
    low_stock: lowRows.sort((a, b) => a.qty - b.qty).slice(0, 8).map((r) => ({ code: r.code, name_en: r.name_en, name_ar: r.name_ar, qty: r.qty, reorder_level: r.reorder_level })),
    stock_per_branch: perBranch.map((r) => ({ ...r, qty: num(r.qty), value: num(r.value) })),
  });
};

const MOVE_SQL = `
  SELECT t.date, i.code, i.name_en, i.name_ar, t.type, t.reference_type, COALESCE(b.name_en, 'Main store') AS branch,
         t.quantity, t.unit_cost, t.quantity * t.unit_cost AS value, t.balance_qty_after, t.notes
    FROM inventory_transactions t
    JOIN items i ON i.id = t.item_id
    LEFT JOIN branches b ON b.id = t.branch_id
   WHERE t.company_id = :c`;

async function movement(p, extra = '') {
  const params = { c: p.companyId, b: p.branchId, from: p.from, to: p.to, item: p.itemId };
  const sql = `${MOVE_SQL}
    ${p.from ? 'AND t.date >= :from' : ''} ${p.to ? 'AND t.date <= :to' : ''}
    ${p.itemId ? 'AND t.item_id = :item' : ''} ${branchFilter(p.branchId, 't.branch_id')} ${extra}
    ORDER BY t.date ${p.asc ? 'ASC' : 'DESC'}, t.created_at ${p.asc ? 'ASC' : 'DESC'} LIMIT 2000`;
  return (await q(sql, params)).map((r) => ({ ...r, quantity: num(r.quantity), unit_cost: num(r.unit_cost), value: num(r.value), balance_qty_after: num(r.balance_qty_after) }));
}

const REPORTS = {
  'stock-summary': async (p) => ({ rows: (await itemStockRows(p.companyId, p.branchId)).map(withAvail), sumKeys: ['qty', 'booked', 'available', 'value'] }),
  'stock-valuation': async (p) => ({ rows: (await itemStockRows(p.companyId, p.branchId)).map(withAvail).filter((r) => r.qty !== 0), sumKeys: ['qty', 'value'] }),
  'low-stock': async (p) => ({ rows: (await itemStockRows(p.companyId, p.branchId)).map(withAvail).filter((r) => r.reorder_level > 0 && r.qty <= r.reorder_level), sumKeys: [] }),
  'out-of-stock': async (p) => ({ rows: (await itemStockRows(p.companyId, p.branchId)).map(withAvail).filter((r) => r.available <= 0), sumKeys: [] }),
  'stock-movement': async (p) => ({ rows: await movement(p), sumKeys: ['value'] }),
  'stock-in': async (p) => ({ rows: await movement(p, 'AND t.quantity > 0'), sumKeys: ['quantity', 'value'] }),
  'stock-out': async (p) => ({ rows: await movement(p, 'AND t.quantity < 0'), sumKeys: ['quantity', 'value'] }),
  adjustments: async (p) => ({ rows: await movement(p, "AND t.type = 'adjustment'"), sumKeys: ['quantity', 'value'] }),
  'product-ledger': async (p) => {
    if (!p.itemId) { const e = new Error('Choose a product'); e.status = 400; throw e; }
    return { rows: await movement({ ...p, asc: true }), sumKeys: [] };
  },
  expiry: async (p) => {
    const days = Math.min(Math.max(parseInt(p.days, 10) || 90, 1), 3650);
    const rows = (await itemStockRows(p.companyId, p.branchId)).map(withAvail)
      .filter((r) => r.expiry_date && r.qty > 0)
      .map((r) => ({ ...r, days_left: Math.ceil((new Date(r.expiry_date) - new Date(new Date().toISOString().slice(0, 10))) / 86400000) }))
      .filter((r) => r.days_left <= days).sort((a, b) => a.days_left - b.days_left);
    return { rows, sumKeys: ['qty', 'value'] };
  },
  damaged: async (p) => {
    const rows = await q(`
      SELECT d.created_at::date AS date, i.code, i.name_en, i.name_ar, d.damage_type, d.status, COALESCE(b.name_en, 'Main store') AS branch,
             d.quantity, d.unit_cost, d.quantity * COALESCE(d.unit_cost, i.cost_price, 0) AS value, d.notes
        FROM item_damages d JOIN items i ON i.id = d.item_id LEFT JOIN branches b ON b.id = d.branch_id
       WHERE d.company_id = :c ${p.from ? 'AND d.created_at::date >= :from' : ''} ${p.to ? 'AND d.created_at::date <= :to' : ''}
         ${branchFilter(p.branchId, 'd.branch_id')}
       ORDER BY d.created_at DESC LIMIT 2000`, { c: p.companyId, b: p.branchId, from: p.from, to: p.to });
    return { rows: rows.map((r) => ({ ...r, quantity: num(r.quantity), unit_cost: num(r.unit_cost), value: num(r.value) })), sumKeys: ['quantity', 'value'] };
  },
  'warehouse-stock': async (p) => {
    const rows = await q(`
      WITH ${STOCK_CTE}
      SELECT COALESCE(b.name_en, 'Main store') AS location_en, COALESCE(b.name_ar, 'المخزن الرئيسي') AS location_ar,
             i.code, i.name_en, i.name_ar, i.unit, SUM(s.qty) AS qty, SUM(s.qty * s.cost) AS value
        FROM stock s JOIN items i ON i.id = s.item_id LEFT JOIN branches b ON b.id = s.branch_id
       WHERE COALESCE(i.item_type, 'stock') <> 'service' ${branchFilter(p.branchId)}
       GROUP BY b.name_en, b.name_ar, i.code, i.name_en, i.name_ar, i.unit
      HAVING SUM(s.qty) <> 0 ORDER BY 1, i.code`, { c: p.companyId, b: p.branchId });
    return { rows: rows.map((r) => ({ ...r, qty: num(r.qty), value: num(r.value) })), sumKeys: ['qty', 'value'] };
  },
};

exports.report = async (req, res) => {
  const fn = REPORTS[req.params.type];
  if (!fn) return res.status(404).json({ message: 'Unknown report' });
  const { branch_id, item_id, from, to, days } = req.query;
  const { rows, sumKeys } = await fn({ companyId: req.companyId, branchId: branch_id || null, itemId: item_id || null, from, to, days });
  const totals = {};
  sumKeys.forEach((k) => { totals[k] = rows.reduce((s, r) => s + num(r[k]), 0); });
  res.json({ type: req.params.type, rows, totals, count: rows.length });
};
