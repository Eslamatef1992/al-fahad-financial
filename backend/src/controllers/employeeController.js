const { sequelize, Employee, Vehicle, Account } = require('../models');
const crudFactory = require('../utils/crudFactory');
const { createLinkedAccount, syncLinkedAccount } = require('../utils/linkedAccount');
const { nextCode } = require('../utils/codeGenerator');

const include = [{ model: Vehicle, as: 'assignedVehicles' }, { model: Account, as: 'account' }, { model: Account, as: 'deductionAccount' }];
const base = crudFactory(Employee, { include, searchFields: ['name_en', 'name_ar', 'code', 'phone', 'email', 'position'] });

exports.list = base.list;
exports.get = base.get;
exports.remove = base.remove;

// Employee codes are always system-generated (EMP-00001, EMP-00002, ...) so there's
// never a manual numbering scheme to get wrong or collide on.
async function nextEmployeeCode(companyId) {
  return nextCode(Employee, companyId, 'EMP');
}

// Creating an employee can optionally auto-create up to two ledger sub-accounts:
// - `account_id` nested under `parent_account_id` (e.g. a "Staff Advances/Payroll" group)
// - `deduction_account_id` nested under `deduction_parent_account_id` (e.g. "Other Payables")
// Each is its own real account with a single parent, so Chart of Accounts balances never
// double-count — this is the "separate linked account per purpose" pattern, not the same
// account appearing under two parents. The deduction account reuses the employee's code
// with a "-DED" suffix since Account codes are unique per company.
exports.create = async (req, res) => {
  const { parent_account_id, deduction_parent_account_id, code, ...body } = req.body; // client-supplied code is ignored; always auto-generated
  const created = await sequelize.transaction(async (t) => {
    const finalCode = await nextEmployeeCode(req.companyId);
    let account_id = null;
    if (parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: parent_account_id,
        code: finalCode, name_en: body.name_en, name_ar: body.name_ar, opening_balance: 0,
      }, t);
      account_id = account.id;
    }
    let deduction_account_id = null;
    if (deduction_parent_account_id) {
      const deductionAccount = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: deduction_parent_account_id,
        code: `${finalCode}-DED`, name_en: `${body.name_en} - Deductions`, name_ar: `${body.name_ar} - خصومات`, opening_balance: 0,
      }, t);
      deduction_account_id = deductionAccount.id;
    }
    return Employee.create({ ...body, code: finalCode, account_id, deduction_account_id, company_id: req.companyId }, { transaction: t });
  });
  const withAccount = await Employee.findOne({ where: { id: created.id }, include });
  res.status(201).json(withAccount);
};

exports.update = async (req, res) => {
  const { parent_account_id, deduction_parent_account_id, code, ...body } = req.body; // code is immutable after creation
  const employee = await Employee.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!employee) return res.status(404).json({ message: 'Employee not found' });

  await sequelize.transaction(async (t) => {
    let account_id = employee.account_id;
    if (!account_id && parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: parent_account_id,
        code: employee.code, name_en: body.name_en, name_ar: body.name_ar, opening_balance: 0,
      }, t);
      account_id = account.id;
    } else if (account_id) {
      await syncLinkedAccount(account_id, { name_en: body.name_en, name_ar: body.name_ar, parent_id: parent_account_id }, t);
    }

    let deduction_account_id = employee.deduction_account_id;
    if (!deduction_account_id && deduction_parent_account_id) {
      const deductionAccount = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: deduction_parent_account_id,
        code: `${employee.code}-DED`, name_en: `${body.name_en} - Deductions`, name_ar: `${body.name_ar} - خصومات`, opening_balance: 0,
      }, t);
      deduction_account_id = deductionAccount.id;
    } else if (deduction_account_id) {
      await syncLinkedAccount(deduction_account_id, { name_en: `${body.name_en} - Deductions`, name_ar: `${body.name_ar} - خصومات`, parent_id: deduction_parent_account_id }, t);
    }

    await employee.update({ ...body, account_id, deduction_account_id }, { transaction: t });
  });

  const updated = await Employee.findOne({ where: { id: employee.id }, include });
  res.json(updated);
};
