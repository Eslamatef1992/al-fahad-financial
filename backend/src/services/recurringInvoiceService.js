const { sequelize, RecurringInvoice, RecurringInvoiceLine } = require('../models');
const invoiceService = require('./invoiceService');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound() { const e = new Error('Recurring invoice template not found'); e.status = 404; return e; }

function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr);
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (frequency === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
  else if (frequency === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

async function createTemplate(companyId, payload) {
  const { type, client_id, supplier_id, cost_center_id, name, frequency, due_in_days, next_run_date, notes, currency, lines } = payload;
  if (!['sales', 'purchase'].includes(type)) throw badRequest('Type must be "sales" or "purchase"');
  if (type === 'sales' && !client_id) throw badRequest('client_id is required for a sales recurring template');
  if (type === 'purchase' && !supplier_id) throw badRequest('supplier_id is required for a purchase recurring template');
  if (!Array.isArray(lines) || lines.length === 0) throw badRequest('At least one line item is required');
  if (!next_run_date) throw badRequest('next_run_date is required');

  return sequelize.transaction(async (t) => {
    const template = await RecurringInvoice.create({
      company_id: companyId, type, client_id: client_id || null, supplier_id: supplier_id || null,
      cost_center_id: cost_center_id || null, name, frequency, due_in_days: due_in_days ?? 30,
      next_run_date, notes, currency: currency || 'KWD', is_active: true,
    }, { transaction: t });

    await Promise.all(lines.map((l, idx) => RecurringInvoiceLine.create({
      recurring_invoice_id: template.id, account_id: l.account_id, description: l.description || '',
      quantity: l.quantity ?? 1, unit_price: l.unit_price ?? 0, tax_rate: l.tax_rate ?? 0, line_order: idx,
    }, { transaction: t })));

    return template;
  });
}

async function updateTemplate(companyId, templateId, payload) {
  const template = await RecurringInvoice.findOne({ where: { id: templateId, company_id: companyId } });
  if (!template) throw notFound();
  const { name, frequency, due_in_days, next_run_date, notes, is_active } = payload;
  await template.update({
    ...(name !== undefined && { name }),
    ...(frequency !== undefined && { frequency }),
    ...(due_in_days !== undefined && { due_in_days }),
    ...(next_run_date !== undefined && { next_run_date }),
    ...(notes !== undefined && { notes }),
    ...(is_active !== undefined && { is_active }),
  });
  return template;
}

// Scans active templates whose next_run_date has arrived, generates a draft
// invoice for each (left as draft for review before posting to the ledger),
// and advances the template's schedule. Scoped to one company if provided,
// otherwise runs across all companies (used by the daily scheduler).
async function generateDueInvoices(companyId) {
  const where = { is_active: true };
  if (companyId) where.company_id = companyId;

  const today = new Date().toISOString().slice(0, 10);
  const dueTemplates = await RecurringInvoice.findAll({
    where: { ...where },
    include: [{ model: RecurringInvoiceLine, as: 'lines' }],
  });

  const generated = [];
  for (const template of dueTemplates) {
    if (template.next_run_date > today) continue;

    const invoiceDate = template.next_run_date;
    const invoice = await invoiceService.createInvoice(template.company_id, null, {
      type: template.type,
      client_id: template.client_id,
      supplier_id: template.supplier_id,
      cost_center_id: template.cost_center_id,
      date: invoiceDate,
      due_date: addDays(invoiceDate, template.due_in_days),
      currency: template.currency,
      notes: `Auto-generated from recurring template: ${template.name}`,
      lines: template.lines.map((l) => ({
        account_id: l.account_id, description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate,
      })),
    });
    await invoice.update({ recurring_invoice_id: template.id });

    await template.update({ next_run_date: advanceDate(template.next_run_date, template.frequency), last_generated_at: new Date() });
    generated.push(invoice);
  }
  return generated;
}

module.exports = { createTemplate, updateTemplate, generateDueInvoices, advanceDate };
