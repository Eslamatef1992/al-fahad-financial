const { Op } = require('sequelize');
const { DiscountCode, Invoice, InvoiceLine } = require('../models');

function badRequest(message) { const e = new Error(message); e.status = 400; return e; }

function round3(n) { return Math.round(Number(n) * 1000) / 1000; }

function todayStr() { return new Date().toISOString().slice(0, 10); }

// Looks a code up case-insensitively within the company and confirms it's
// currently usable (active, not expired). Does NOT check scope, minimum
// amount, or usage limit — those are contextual and checked separately by
// the caller, so each failure can get its own clear message.
async function findUsableCode(companyId, codeStr, t) {
  if (!codeStr) return null;
  const code = await DiscountCode.findOne({
    where: { company_id: companyId, code: { [Op.iLike]: codeStr.trim() } },
    transaction: t,
  });
  if (!code || !code.is_active) throw badRequest(`Discount code "${codeStr}" was not found or is inactive`);
  if (code.expiry_date && code.expiry_date < todayStr()) throw badRequest(`Discount code "${code.code}" expired on ${code.expiry_date}`);
  return code;
}

function checkScope(code, expectedScope) {
  if (code.scope !== expectedScope) {
    throw badRequest(
      expectedScope === 'invoice'
        ? `"${code.code}" is a line-item code — apply it on the individual line, not the whole invoice`
        : `"${code.code}" is a whole-invoice code — apply it on the invoice, not an individual line`,
    );
  }
}

function checkMinAmount(code, baseAmount) {
  if (code.min_invoice_amount && Number(baseAmount) < Number(code.min_invoice_amount)) {
    throw badRequest(`"${code.code}" requires a minimum amount of ${Number(code.min_invoice_amount).toFixed(3)} (this amount is ${Number(baseAmount).toFixed(3)})`);
  }
}

// Usage is derived live from existing invoices rather than a stored counter,
// so editing/deleting a draft invoice automatically frees capacity back up
// with no manual increment/decrement bookkeeping to keep in sync.
async function usageCount(companyId, discountCodeId, excludeInvoiceId, t) {
  const headerRows = await Invoice.findAll({
    where: { company_id: companyId, discount_code_id: discountCodeId, status: { [Op.ne]: 'cancelled' } },
    attributes: ['id'],
    transaction: t,
  });
  const lineRows = await InvoiceLine.findAll({ where: { discount_code_id: discountCodeId }, attributes: ['invoice_id'], transaction: t });
  const lineInvoiceIds = [...new Set(lineRows.map((r) => r.invoice_id))];
  let lineInvoiceIdsInCompany = [];
  if (lineInvoiceIds.length) {
    lineInvoiceIdsInCompany = (await Invoice.findAll({
      where: { id: { [Op.in]: lineInvoiceIds }, company_id: companyId, status: { [Op.ne]: 'cancelled' } },
      attributes: ['id'],
      transaction: t,
    })).map((r) => r.id);
  }
  const idSet = new Set([...headerRows.map((r) => r.id), ...lineInvoiceIdsInCompany]);
  if (excludeInvoiceId) idSet.delete(excludeInvoiceId);
  return idSet.size;
}

async function checkUsageAvailable(companyId, code, excludeInvoiceId, t) {
  if (code.max_redemptions == null) return;
  const used = await usageCount(companyId, code.id, excludeInvoiceId, t);
  if (used >= code.max_redemptions) throw badRequest(`"${code.code}" has reached its usage limit (${code.max_redemptions})`);
}

function computeAmount(code, baseAmount) {
  const base = Number(baseAmount);
  if (base <= 0) return 0;
  if (code.type === 'percentage') return round3(base * (Number(code.value) / 100));
  return round3(Math.min(Number(code.value), base));
}

// Splits `totalDiscount` across `weights` (each line's raw pre-discount
// amount) proportionally, correcting rounding drift on the last non-zero
// line so the parts always sum to exactly `totalDiscount`.
function allocateProportional(totalDiscount, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || totalDiscount <= 0) return weights.map(() => 0);
  const allocated = weights.map((w) => round3((totalDiscount * w) / sum));
  const allocatedSum = round3(allocated.reduce((a, b) => a + b, 0));
  const diff = round3(totalDiscount - allocatedSum);
  if (Math.abs(diff) >= 0.001) {
    for (let i = weights.length - 1; i >= 0; i -= 1) {
      if (weights[i] > 0) { allocated[i] = round3(allocated[i] + diff); break; }
    }
  }
  return allocated;
}

// Full end-to-end resolution for a raw invoice payload's discount inputs.
// Returns per-line discount amounts (index-aligned with `lines`), the
// header-level discount_code_id (if any), and the combined discount total.
// Does not persist anything — createInvoice/updateInvoice call this, then
// use the results while building InvoiceLine rows.
async function resolveDiscounts(companyId, { lines, discount_code, excludeInvoiceId }, t) {
  const hasLineCodes = lines.some((l) => l.discount_code);
  if (discount_code && hasLineCodes) {
    throw badRequest('Apply a discount code either to the whole invoice or to individual line items, not both');
  }

  const rawAmounts = lines.map((l) => Number(l.quantity ?? 1) * Number(l.unit_price ?? 0));
  const perLineDiscount = lines.map(() => 0);
  const perLineCodeId = lines.map(() => null);
  let discountCodeId = null;
  let totalDiscount = 0;

  if (discount_code) {
    const code = await findUsableCode(companyId, discount_code, t);
    checkScope(code, 'invoice');
    const rawTotal = rawAmounts.reduce((a, b) => a + b, 0);
    checkMinAmount(code, rawTotal);
    await checkUsageAvailable(companyId, code, excludeInvoiceId, t);
    totalDiscount = computeAmount(code, rawTotal);
    const allocated = allocateProportional(totalDiscount, rawAmounts);
    allocated.forEach((amt, i) => { perLineDiscount[i] = amt; });
    discountCodeId = code.id;
  } else if (hasLineCodes) {
    const usedCodeIds = new Set();
    for (let i = 0; i < lines.length; i += 1) {
      const codeStr = lines[i].discount_code;
      if (!codeStr) continue;
      const code = await findUsableCode(companyId, codeStr, t);
      checkScope(code, 'line');
      checkMinAmount(code, rawAmounts[i]);
      if (!usedCodeIds.has(code.id)) {
        await checkUsageAvailable(companyId, code, excludeInvoiceId, t);
        usedCodeIds.add(code.id);
      }
      perLineDiscount[i] = computeAmount(code, rawAmounts[i]);
      perLineCodeId[i] = code.id;
      totalDiscount += perLineDiscount[i];
    }
    totalDiscount = round3(totalDiscount);
  }

  return { perLineDiscount, perLineCodeId, discountCodeId, totalDiscount };
}

// Same validation as resolveDiscounts, but only for a single quick lookup —
// used by the "preview" endpoint so the frontend can show the computed
// amount before the invoice is actually saved.
async function previewDiscount(companyId, codeStr, baseAmount, expectedScope) {
  const code = await findUsableCode(companyId, codeStr, null);
  if (expectedScope) checkScope(code, expectedScope);
  checkMinAmount(code, baseAmount);
  await checkUsageAvailable(companyId, code, null, null);
  return {
    code: code.code,
    type: code.type,
    value: Number(code.value),
    scope: code.scope,
    discount_amount: computeAmount(code, baseAmount),
  };
}

module.exports = {
  findUsableCode, checkScope, checkMinAmount, checkUsageAvailable, usageCount,
  computeAmount, allocateProportional, resolveDiscounts, previewDiscount, round3,
};
