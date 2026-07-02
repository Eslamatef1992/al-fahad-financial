const { Client, Account } = require('../models');
const crudFactory = require('../utils/crudFactory');
module.exports = crudFactory(Client, { include: [{ model: Account, as: 'account' }], searchFields: ['name_en', 'name_ar', 'code', 'phone', 'email'] });
