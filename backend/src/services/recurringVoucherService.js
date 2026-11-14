const { RecurringVoucher } = require('../models');
const voucherService = require('./voucherService');
const { advanceDate } = require('./recurringInvoiceService');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }
function notFound() { const e = new Error('Recurring voucher template not found'); e.status = 404; return e; }

function cleanLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw badRequest('At least two lines are required');
  const out = lines.map((l) => ({
    account_id: l.account_id, debit: Number(l.debit || 0), credit: Number(l.credit || 0), description: l.description || '',
  }));
  if (out.some((l) => !l.account_id)) throw badRequest('Every line needs an account');
  const d = out.reduce((s, l) => s + l.debit, 0);
  const c = out.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(d - c) > 0.001) throw badRequest(`Template is not balanced: debit ${d} vs credit ${c}`);
  return out;
}

async function createTemplate(companyId, payload) {
  const { name, voucher_type, frequency, next_run_date, description, currency, cost_center_id, branch_id, lines } = payload;
  if (!name) throw badRequest('name is required');
  if (!['receipt', 'payment', 'journal'].includes(voucher_type)) throw badRequest('Invalid voucher_type');
  if (!['weekly', 'monthly', 'quarterly', 'yearly'].includes(frequency)) throw badRequest('Invalid frequency');
  if (!next_run_date) throw badRequest('next_run_date is required');
  return RecurringVoucher.create({
    company_id: companyId, name, voucher_type, frequency, next_run_date, description: description || null,
    currency: currency || 'KWD', cost_center_id: cost_center_id || null, branch_id: branch_id || null,
    lines: cleanLines(lines), is_active: true,
  });
}

async function updateTemplate(companyId, id, payload) {
  const t = await RecurringVoucher.findOne({ where: { id, company_id: companyId } });
  if (!t) throw notFound();
  const { name, voucher_type, frequency, next_run_date, description, cost_center_id, branch_id, lines, is_active } = payload;
  await t.update({
    ...(name !== undefined && { name }),
    ...(voucher_type !== undefined && { voucher_type }),
    ...(frequency !== undefined && { frequency }),
    ...(next_run_date !== undefined && { next_run_date }),
    ...(description !== undefined && { description }),
    ...(cost_center_id !== undefined && { cost_center_id: cost_center_id || null }),
    ...(branch_id !== undefined && { branch_id: branch_id || null }),
    ...(lines !== undefined && { lines: cleanLines(lines) }),
    ...(is_active !== undefined && { is_active }),
  });
  return t;
}

// Generates a DRAFT voucher for every active template whose next_run_date has
// arrived (catching up one occurrence per call per template), then advances the
// schedule. Drafts are left for review before posting, same as recurring invoices.
async function generateDueVouchers(companyId) {
  const where = { is_active: true };
  if (companyId) where.company_id = companyId;
  const today = new Date().toISOString().slice(0, 10);
  const templates = await RecurringVoucher.findAll({ where });
  const generated = [];
  for (const tpl of templates) {
    if (tpl.next_run_date > today) continue;
    const voucher = await voucherService.createVoucher(tpl.company_id, null, {
      voucher_type: tpl.voucher_type,
      date: tpl.next_run_date,
      description: `${tpl.description ? `${tpl.description} — ` : ''}Auto-generated from recurring template: ${tpl.name}`,
      currency: tpl.currency,
      cost_center_id: tpl.cost_center_id,
      branch_id: tpl.branch_id,
      lines: tpl.lines,
    });
    await tpl.update({ next_run_date: advanceDate(tpl.next_run_date, tpl.frequency), last_generated_at: new Date() });
    generated.push(voucher);
  }
  return generated;
}

module.exports = { createTemplate, updateTemplate, generateDueVouchers };
