const { CashAccount, Account } = require('../models');
const crudFactory = require('../utils/crudFactory');
module.exports = crudFactory(CashAccount, { include: [{ model: Account, as: 'account' }], searchFields: ['name_en', 'name_ar'] });
