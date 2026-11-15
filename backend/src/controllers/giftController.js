const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

// Gifts given away on sales invoices (free lines): what, to whom, by whom, and what
// they cost / would have sold for.
exports.report = async (req, res) => {
  const { from, to, branch_id } = req.query;
  const rows = await sequelize.query(`
    SELECT l.id, i.id AS invoice_id, i.invoice_no, i.date, i.channel, cl.name_en AS client, sp.name_en AS salesperson, b.name_en AS branch,
           it.code, it.name_en, it.name_ar, l.quantity, COALESCE(l.gift_value, 0) AS retail_value,
           COALESCE((SELECT t.unit_cost FROM inventory_transactions t WHERE t.reference_type = 'invoice' AND t.reference_id = i.id AND t.item_id = l.item_id AND t.type = 'sale' LIMIT 1), it.cost_price, 0) AS unit_cost
      FROM invoice_lines l
      JOIN invoices i ON i.id = l.invoice_id
      LEFT JOIN items it ON it.id = l.item_id
      LEFT JOIN clients cl ON cl.id = i.client_id
      LEFT JOIN sales_people sp ON sp.id = i.salesperson_id
      LEFT JOIN branches b ON b.id = i.branch_id
     WHERE i.company_id = :c AND l.is_gift = TRUE AND i.status <> 'cancelled'
       AND i.date BETWEEN :from AND :to ${branch_id ? 'AND i.branch_id = :b' : ''}
     ORDER BY i.date DESC, i.invoice_no DESC LIMIT 2000`,
  { replacements: { c: req.companyId, from: from || '1900-01-01', to: to || '2999-12-31', b: branch_id }, type: QueryTypes.SELECT });
  const out = rows.map((r) => ({ ...r, quantity: Number(r.quantity), retail_value: Number(r.retail_value), unit_cost: Number(r.unit_cost), cost: Number(r.unit_cost) * Number(r.quantity) }));
  res.json({
    rows: out,
    totals: { count: out.length, quantity: out.reduce((s, r) => s + r.quantity, 0), cost: out.reduce((s, r) => s + r.cost, 0), retail_value: out.reduce((s, r) => s + r.retail_value, 0) },
  });
};
