const { sequelize, Employee, EmployeeLeave, User } = require('../models');

const BALANCE_FIELD = { vacation: 'vacation_balance', sick: 'sick_leave_balance' };

const include = [
  { model: Employee, as: 'employee', attributes: ['id', 'code', 'name_en', 'name_ar'] },
  { model: User, as: 'creator', attributes: ['id', 'name'] },
];

// Lists leave entries, optionally filtered to one employee via ?employee_id=
exports.list = async (req, res) => {
  const where = { company_id: req.companyId };
  if (req.query.employee_id) where.employee_id = req.query.employee_id;
  const leaves = await EmployeeLeave.findAll({ where, include, order: [['date_from', 'DESC'], ['createdAt', 'DESC']] });
  res.json(leaves);
};

// Logs a vacation/sick-leave entry and atomically deducts it from the employee's running
// balance. Rejected if the employee doesn't have enough balance left, so the balance
// field can never silently go negative through this path.
exports.create = async (req, res) => {
  const { employee_id, type, date_from, date_to, days, notes } = req.body;
  if (!BALANCE_FIELD[type]) return res.status(400).json({ message: 'type must be "vacation" or "sick"' });

  const employee = await Employee.findOne({ where: { id: employee_id, company_id: req.companyId } });
  if (!employee) return res.status(404).json({ message: 'Employee not found' });

  const requestedDays = Number(days);
  if (!requestedDays || requestedDays <= 0) return res.status(400).json({ message: 'Days must be greater than zero' });

  const balanceField = BALANCE_FIELD[type];
  const currentBalance = Number(employee[balanceField] || 0);
  if (requestedDays > currentBalance) {
    return res.status(400).json({ message: `Insufficient balance: ${currentBalance} day(s) available` });
  }

  const created = await sequelize.transaction(async (t) => {
    const leave = await EmployeeLeave.create({
      company_id: req.companyId, employee_id, type, date_from: date_from || null, date_to: date_to || null,
      days: requestedDays, notes: notes || null, created_by: req.user?.id,
    }, { transaction: t });
    await employee.update({ [balanceField]: currentBalance - requestedDays }, { transaction: t });
    return leave;
  });

  const withIncludes = await EmployeeLeave.findOne({ where: { id: created.id }, include });
  res.status(201).json(withIncludes);
};

// Deletes a leave entry and restores its days back to the employee's balance (an "undo").
exports.remove = async (req, res) => {
  const leave = await EmployeeLeave.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!leave) return res.status(404).json({ message: 'Not found' });

  const employee = await Employee.findOne({ where: { id: leave.employee_id, company_id: req.companyId } });
  const balanceField = BALANCE_FIELD[leave.type];

  await sequelize.transaction(async (t) => {
    if (employee && balanceField) {
      await employee.update({ [balanceField]: Number(employee[balanceField] || 0) + Number(leave.days) }, { transaction: t });
    }
    await leave.destroy({ transaction: t });
  });

  res.json({ message: 'Deleted' });
};
