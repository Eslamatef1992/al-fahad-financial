const { sequelize, Client, Account, Company } = require('../models');
const crudFactory = require('../utils/crudFactory');
const { createLinkedAccount, syncLinkedAccount } = require('../utils/linkedAccount');
const { nextCode } = require('../utils/codeGenerator');
const { exportClients } = require('../services/excelService');
const { generateClientsPdf } = require('../services/pdfService');

const base = crudFactory(Client, { include: [{ model: Account, as: 'account' }], searchFields: ['name_en', 'name_ar', 'code', 'phone', 'email'] });

exports.list = base.list;
exports.get = base.get;
exports.remove = base.remove;

exports.exportExcel = async (req, res) => {
  const rows = await Client.findAll({ where: { company_id: req.companyId, is_active: true }, include: [{ model: Account, as: 'account' }], order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  await exportClients(res, company, rows);
};

exports.pdf = async (req, res) => {
  const rows = await Client.findAll({ where: { company_id: req.companyId, is_active: true }, include: [{ model: Account, as: 'account' }], order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  generateClientsPdf(res, rows, company);
};

// Creating a client always gets a system-generated code (CLI-00001, CLI-00002, ...) —
// any client-supplied code is ignored, same reasoning as Employees: no manual numbering
// scheme to get wrong or collide on. It can optionally also auto-create its ledger
// sub-account nested directly under a chosen control account (e.g. Accounts Receivable),
// using that generated code.
exports.create = async (req, res) => {
  const { parent_account_id, code, ...body } = req.body;
  const created = await sequelize.transaction(async (t) => {
    const finalCode = await nextCode(Client, req.companyId, 'CLI');
    let account_id = null;
    if (parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId,
        parentAccountId: parent_account_id,
        code: finalCode,
        name_en: body.name_en,
        name_ar: body.name_ar,
        opening_balance: body.opening_balance,
      }, t);
      account_id = account.id;
    }
    return Client.create({ ...body, code: finalCode, account_id, company_id: req.companyId }, { transaction: t });
  });
  const withAccount = await Client.findOne({ where: { id: created.id }, include: [{ model: Account, as: 'account' }] });
  res.status(201).json(withAccount);
};

exports.update = async (req, res) => {
  const { parent_account_id, code, ...body } = req.body; // code is immutable after creation
  const item = await Client.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!item) return res.status(404).json({ message: 'Not found' });

  await sequelize.transaction(async (t) => {
    let account_id = item.account_id;
    if (!account_id && parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: parent_account_id,
        code: item.code, name_en: body.name_en, name_ar: body.name_ar, opening_balance: body.opening_balance,
      }, t);
      account_id = account.id;
    } else if (account_id) {
      await syncLinkedAccount(account_id, {
        name_en: body.name_en, name_ar: body.name_ar,
        opening_balance: body.opening_balance, parent_id: parent_account_id,
      }, t);
    }
    await item.update({ ...body, account_id }, { transaction: t });
  });

  const updated = await Client.findOne({ where: { id: item.id }, include: [{ model: Account, as: 'account' }] });
  res.json(updated);
};
