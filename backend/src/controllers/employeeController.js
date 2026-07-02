const { Employee, Vehicle } = require('../models');
const crudFactory = require('../utils/crudFactory');
module.exports = crudFactory(Employee, { include: [{ model: Vehicle, as: 'assignedVehicles' }], searchFields: ['name_en', 'name_ar', 'code', 'phone', 'email', 'position'] });
