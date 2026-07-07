const { CashAccount, Account, Company } = require('../models');
const crudFactory = require('../utils/crudFactory');
const { exportCashAccounts } = require('../services/excelService');
const { generateCashAccountsPdf } = require('../services/pdfService');

const include = [{ model: Account, as: 'account' }];
const base = crudFactory(CashAccount, { include, searchFields: ['name_en', 'name_ar'] });

module.exports = {
  ...base,
  exportExcel: async (req, res) => {
    const rows = await CashAccount.findAll({ where: { company_id: req.companyId, is_active: true }, include, order: [['name_en', 'ASC']] });
    const company = await Company.findByPk(req.companyId);
    await exportCashAccounts(res, company, rows);
  },
  pdf: async (req, res) => {
    const rows = await CashAccount.findAll({ where: { company_id: req.companyId, is_active: true }, include, order: [['name_en', 'ASC']] });
    const company = await Company.findByPk(req.companyId);
    generateCashAccountsPdf(res, rows, company);
  },
};
