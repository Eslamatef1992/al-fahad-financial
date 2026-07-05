const sequelize = require('../config/db');
const { DataTypes } = require('sequelize');

const Company = require('./Company')(sequelize, DataTypes);
const User = require('./User')(sequelize, DataTypes);
const UserCompany = require('./UserCompany')(sequelize, DataTypes);
const Account = require('./Account')(sequelize, DataTypes);
const CostCenter = require('./CostCenter')(sequelize, DataTypes);
const Client = require('./Client')(sequelize, DataTypes);
const Supplier = require('./Supplier')(sequelize, DataTypes);
const Employee = require('./Employee')(sequelize, DataTypes);
const Vehicle = require('./Vehicle')(sequelize, DataTypes);
const VehicleDocument = require('./VehicleDocument')(sequelize, DataTypes);
const VehicleMaintenance = require('./VehicleMaintenance')(sequelize, DataTypes);
const CashAccount = require('./CashAccount')(sequelize, DataTypes);
const FiscalYear = require('./FiscalYear')(sequelize, DataTypes);
const Voucher = require('./Voucher')(sequelize, DataTypes);
const VoucherLine = require('./VoucherLine')(sequelize, DataTypes);
const LedgerEntry = require('./LedgerEntry')(sequelize, DataTypes);
const AuditLog = require('./AuditLog')(sequelize, DataTypes);
const Invoice = require('./Invoice')(sequelize, DataTypes);
const InvoiceLine = require('./InvoiceLine')(sequelize, DataTypes);
const InvoicePayment = require('./InvoicePayment')(sequelize, DataTypes);
const RecurringInvoice = require('./RecurringInvoice')(sequelize, DataTypes);
const RecurringInvoiceLine = require('./RecurringInvoiceLine')(sequelize, DataTypes);

// ---- Associations ----

// Company <-> User (many-to-many via UserCompany)
Company.belongsToMany(User, { through: UserCompany, foreignKey: 'company_id', otherKey: 'user_id', as: 'users' });
User.belongsToMany(Company, { through: UserCompany, foreignKey: 'user_id', otherKey: 'company_id', as: 'companies' });
UserCompany.belongsTo(Company, { foreignKey: 'company_id' });
UserCompany.belongsTo(User, { foreignKey: 'user_id' });

// Company has many of everything
const companyHasMany = [Account, CostCenter, Client, Supplier, Employee, Vehicle, CashAccount, FiscalYear, Voucher, LedgerEntry, Invoice, RecurringInvoice];
companyHasMany.forEach((Model) => {
  Company.hasMany(Model, { foreignKey: 'company_id' });
  Model.belongsTo(Company, { foreignKey: 'company_id' });
});

// Chart of Accounts - self referencing tree (dynamic sub-levels)
Account.hasMany(Account, { as: 'children', foreignKey: 'parent_id' });
Account.belongsTo(Account, { as: 'parent', foreignKey: 'parent_id' });

// Cost Centers - self referencing tree
CostCenter.hasMany(CostCenter, { as: 'children', foreignKey: 'parent_id' });
CostCenter.belongsTo(CostCenter, { as: 'parent', foreignKey: 'parent_id' });

// Clients / Suppliers / Vehicles / Employees / Cost Centers link to a control account in chart of accounts
Client.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
Supplier.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
Employee.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
// Employees can additionally link a second control account specifically for payroll
// deductions (e.g. nested under a separate "Other Payables"/"Deductions" parent), distinct
// from the primary account_id link above — each account keeps a single parent, so balances
// never double-count across two branches of the Chart of Accounts.
Employee.belongsTo(Account, { foreignKey: 'deduction_account_id', as: 'deductionAccount' });
CashAccount.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
Vehicle.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
CostCenter.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });

// Vehicle assigned to a driver (Employee)
Vehicle.belongsTo(Employee, { foreignKey: 'assigned_driver_id', as: 'driver' });
Employee.hasMany(Vehicle, { foreignKey: 'assigned_driver_id', as: 'assignedVehicles' });

Vehicle.hasMany(VehicleDocument, { foreignKey: 'vehicle_id', as: 'documents', onDelete: 'CASCADE' });
VehicleDocument.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });

Vehicle.hasMany(VehicleMaintenance, { foreignKey: 'vehicle_id', as: 'maintenanceRecords', onDelete: 'CASCADE' });
VehicleMaintenance.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });

// Vouchers -> Voucher Lines -> Ledger Entries
Voucher.hasMany(VoucherLine, { foreignKey: 'voucher_id', as: 'lines', onDelete: 'CASCADE' });
VoucherLine.belongsTo(Voucher, { foreignKey: 'voucher_id' });
VoucherLine.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
VoucherLine.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
VoucherLine.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });
VoucherLine.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });

Voucher.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
Voucher.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

LedgerEntry.belongsTo(Voucher, { foreignKey: 'voucher_id' });
LedgerEntry.belongsTo(VoucherLine, { foreignKey: 'voucher_line_id' });
LedgerEntry.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
LedgerEntry.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
Account.hasMany(LedgerEntry, { foreignKey: 'account_id' });

AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
AuditLog.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// ---- Invoicing associations ----
Invoice.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });
Invoice.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
Invoice.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
Invoice.belongsTo(Account, { foreignKey: 'tax_account_id', as: 'taxAccount' });
Invoice.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

Invoice.hasMany(InvoiceLine, { foreignKey: 'invoice_id', as: 'lines', onDelete: 'CASCADE' });
InvoiceLine.belongsTo(Invoice, { foreignKey: 'invoice_id' });
InvoiceLine.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });

Invoice.hasMany(InvoicePayment, { foreignKey: 'invoice_id', as: 'payments', onDelete: 'CASCADE' });
InvoicePayment.belongsTo(Invoice, { foreignKey: 'invoice_id' });
InvoicePayment.belongsTo(Voucher, { foreignKey: 'voucher_id', as: 'voucher' });

RecurringInvoice.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });
RecurringInvoice.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
RecurringInvoice.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
RecurringInvoice.hasMany(RecurringInvoiceLine, { foreignKey: 'recurring_invoice_id', as: 'lines', onDelete: 'CASCADE' });
RecurringInvoiceLine.belongsTo(RecurringInvoice, { foreignKey: 'recurring_invoice_id' });
RecurringInvoiceLine.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });

module.exports = {
  sequelize,
  Company,
  User,
  UserCompany,
  AuditLog,
  Invoice,
  InvoiceLine,
  InvoicePayment,
  RecurringInvoice,
  RecurringInvoiceLine,
  Account,
  CostCenter,
  Client,
  Supplier,
  Employee,
  Vehicle,
  VehicleDocument,
  VehicleMaintenance,
  CashAccount,
  FiscalYear,
  Voucher,
  VoucherLine,
  LedgerEntry,
};
