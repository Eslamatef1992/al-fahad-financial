const { sequelize, Voucher, VoucherLine, LedgerEntry, Account } = require('../models');

const TYPE_PREFIX = { receipt: 'RV', payment: 'PV', journal: 'JV' };

async function nextVoucherNo(companyId, voucherType) {
  const prefix = TYPE_PREFIX[voucherType] || 'JV';
  const count = await Voucher.count({ where: { company_id: companyId, voucher_type: voucherType } });
  return `${prefix}-${String(count + 1).padStart(6, '0')}`;
}

// Creates a voucher with its lines in 'draft' status. Debit/credit balance is
// validated but ledger entries are NOT created until the voucher is posted.
async function createVoucher(companyId, userId, payload) {
  const { voucher_type, date, description, cost_center_id, currency, lines } = payload;

  if (!Array.isArray(lines) || lines.length < 2) {
    const err = new Error('A voucher requires at least two lines');
    err.status = 400;
    throw err;
  }

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    const err = new Error(`Voucher is not balanced: debit ${totalDebit} vs credit ${totalCredit}`);
    err.status = 400;
    throw err;
  }

  return sequelize.transaction(async (t) => {
    const voucher_no = await nextVoucherNo(companyId, voucher_type);
    const voucher = await Voucher.create({
      company_id: companyId,
      cost_center_id: cost_center_id || null,
      voucher_no,
      voucher_type,
      date,
      description,
      currency: currency || 'KWD',
      status: 'draft',
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_by: userId,
    }, { transaction: t });

    await Promise.all(lines.map((l, idx) => VoucherLine.create({
      voucher_id: voucher.id,
      account_id: l.account_id,
      cost_center_id: l.cost_center_id || cost_center_id || null,
      client_id: l.client_id || null,
      supplier_id: l.supplier_id || null,
      debit: l.debit || 0,
      credit: l.credit || 0,
      description: l.description || '',
      line_order: idx,
    }, { transaction: t })));

    return voucher;
  });
}

// Posts a draft voucher: validates accounts are postable (not group headers),
// creates immutable ledger entries, and marks the voucher as posted.
async function postVoucher(companyId, voucherId) {
  return sequelize.transaction(async (t) => {
    // Lock the voucher header row first (FOR UPDATE cannot be combined with
    // the outer join used to eager-load lines), then fetch lines separately.
    const voucher = await Voucher.findOne({
      where: { id: voucherId, company_id: companyId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!voucher) { const e = new Error('Voucher not found'); e.status = 404; throw e; }
    if (voucher.status !== 'draft') { const e = new Error('Only draft vouchers can be posted'); e.status = 400; throw e; }

    voucher.lines = await VoucherLine.findAll({ where: { voucher_id: voucher.id }, transaction: t });

    for (const line of voucher.lines) {
      const account = await Account.findByPk(line.account_id, { transaction: t });
      if (!account || account.company_id !== companyId) { const e = new Error('Invalid account on voucher line'); e.status = 400; throw e; }
      if (account.is_group) { const e = new Error(`Cannot post to group account ${account.code}`); e.status = 400; throw e; }
    }

    await Promise.all(voucher.lines.map((line) => LedgerEntry.create({
      company_id: companyId,
      voucher_id: voucher.id,
      voucher_line_id: line.id,
      account_id: line.account_id,
      cost_center_id: line.cost_center_id,
      date: voucher.date,
      debit: line.debit,
      credit: line.credit,
      description: line.description || voucher.description,
    }, { transaction: t })));

    await voucher.update({ status: 'posted', posted_at: new Date() }, { transaction: t });
    return voucher;
  });
}

// Cancels a posted voucher by creating reversing ledger entries (never deletes history).
async function cancelVoucher(companyId, voucherId) {
  return sequelize.transaction(async (t) => {
    const voucher = await Voucher.findOne({
      where: { id: voucherId, company_id: companyId },
      include: [{ model: VoucherLine, as: 'lines' }],
      transaction: t,
    });
    if (!voucher) { const e = new Error('Voucher not found'); e.status = 404; throw e; }
    if (voucher.status !== 'posted') { const e = new Error('Only posted vouchers can be cancelled'); e.status = 400; throw e; }

    await Promise.all(voucher.lines.map((line) => LedgerEntry.create({
      company_id: companyId,
      voucher_id: voucher.id,
      voucher_line_id: line.id,
      account_id: line.account_id,
      cost_center_id: line.cost_center_id,
      date: new Date().toISOString().slice(0, 10),
      debit: line.credit,   // reversed
      credit: line.debit,   // reversed
      description: `Reversal of ${voucher.voucher_no}`,
    }, { transaction: t })));

    await voucher.update({ status: 'cancelled' }, { transaction: t });
    return voucher;
  });
}

module.exports = { createVoucher, postVoucher, cancelVoucher, nextVoucherNo };
