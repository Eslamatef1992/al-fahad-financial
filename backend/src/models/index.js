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
const EmployeeLeave = require('./EmployeeLeave')(sequelize, DataTypes);
const Item = require('./Item')(sequelize, DataTypes);
const InventoryTransaction = require('./InventoryTransaction')(sequelize, DataTypes);
const PurchaseOrder = require('./PurchaseOrder')(sequelize, DataTypes);
const PurchaseOrderLine = require('./PurchaseOrderLine')(sequelize, DataTypes);
const Branch = require('./Branch')(sequelize, DataTypes);
const BranchAccount = require('./BranchAccount')(sequelize, DataTypes);
const ItemBranchStock = require('./ItemBranchStock')(sequelize, DataTypes);
const StockTransfer = require('./StockTransfer')(sequelize, DataTypes);
const StockTransferLine = require('./StockTransferLine')(sequelize, DataTypes);
const ItemVariant = require('./ItemVariant')(sequelize, DataTypes);
const ItemVariantBranchStock = require('./ItemVariantBranchStock')(sequelize, DataTypes);
const ItemCategory = require('./ItemCategory')(sequelize, DataTypes);

// ---- Associations ----

// Company <-> User (many-to-many via UserCompany)
Company.belongsToMany(User, { through: UserCompany, foreignKey: 'company_id', otherKey: 'user_id', as: 'users' });
User.belongsToMany(Company, { through: UserCompany, foreignKey: 'user_id', otherKey: 'company_id', as: 'companies' });
UserCompany.belongsTo(Company, { foreignKey: 'company_id' });
UserCompany.belongsTo(User, { foreignKey: 'user_id' });

// Company has many of everything
const companyHasMany = [Account, CostCenter, Client, Supplier, Employee, Vehicle, CashAccount, FiscalYear, Voucher, LedgerEntry, Invoice, RecurringInvoice, EmployeeLeave, Item, InventoryTransaction, PurchaseOrder, Branch, ItemBranchStock, StockTransfer, ItemVariant, ItemVariantBranchStock, ItemCategory];
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
// Vehicles can additionally link a second control account under a separately chosen
// parent (the admin picks whichever parent it should sit under at creation time) —
// same "separate account per purpose" pattern as Employee's deduction_account_id, so
// Chart of Accounts balances never double-count across two branches.
Vehicle.belongsTo(Account, { foreignKey: 'secondary_account_id', as: 'secondaryAccount' });
// Third linked account, same free-choice pattern as the secondary one.
Vehicle.belongsTo(Account, { foreignKey: 'tertiary_account_id', as: 'tertiaryAccount' });
CostCenter.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });

// Vehicle assigned to a driver (Employee)
Vehicle.belongsTo(Employee, { foreignKey: 'assigned_driver_id', as: 'driver' });
Employee.hasMany(Vehicle, { foreignKey: 'assigned_driver_id', as: 'assignedVehicles' });

// Employee vacation/sick-leave log — each entry deducts from the employee's running balance
Employee.hasMany(EmployeeLeave, { foreignKey: 'employee_id', as: 'leaves', onDelete: 'CASCADE' });
EmployeeLeave.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
EmployeeLeave.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

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
Voucher.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Voucher.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

LedgerEntry.belongsTo(Voucher, { foreignKey: 'voucher_id' });
LedgerEntry.belongsTo(VoucherLine, { foreignKey: 'voucher_line_id' });
LedgerEntry.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
LedgerEntry.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
LedgerEntry.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Account.hasMany(LedgerEntry, { foreignKey: 'account_id' });

AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
AuditLog.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// ---- Invoicing associations ----
Invoice.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });
Invoice.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
Invoice.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
Invoice.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Invoice.belongsTo(Account, { foreignKey: 'tax_account_id', as: 'taxAccount' });
Invoice.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

Invoice.hasMany(InvoiceLine, { foreignKey: 'invoice_id', as: 'lines', onDelete: 'CASCADE' });
InvoiceLine.belongsTo(Invoice, { foreignKey: 'invoice_id' });
InvoiceLine.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
InvoiceLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
InvoiceLine.belongsTo(ItemVariant, { foreignKey: 'variant_id', as: 'variant' });

Invoice.hasMany(InvoicePayment, { foreignKey: 'invoice_id', as: 'payments', onDelete: 'CASCADE' });
InvoicePayment.belongsTo(Invoice, { foreignKey: 'invoice_id' });
InvoicePayment.belongsTo(Voucher, { foreignKey: 'voucher_id', as: 'voucher' });

RecurringInvoice.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });
RecurringInvoice.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
RecurringInvoice.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
RecurringInvoice.hasMany(RecurringInvoiceLine, { foreignKey: 'recurring_invoice_id', as: 'lines', onDelete: 'CASCADE' });
RecurringInvoiceLine.belongsTo(RecurringInvoice, { foreignKey: 'recurring_invoice_id' });
RecurringInvoiceLine.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });

// ---- Inventory / Purchase Order associations ----
Item.belongsTo(Account, { foreignKey: 'inventory_account_id', as: 'inventoryAccount' });
Item.belongsTo(Account, { foreignKey: 'income_account_id', as: 'incomeAccount' });
Item.belongsTo(Account, { foreignKey: 'cogs_account_id', as: 'cogsAccount' });
Item.belongsTo(ItemCategory, { foreignKey: 'category_id', as: 'itemCategory' });
ItemCategory.hasMany(Item, { foreignKey: 'category_id', as: 'items' });
Item.hasMany(InventoryTransaction, { foreignKey: 'item_id', as: 'transactions', onDelete: 'CASCADE' });
InventoryTransaction.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
InventoryTransaction.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
InventoryTransaction.belongsTo(ItemVariant, { foreignKey: 'variant_id', as: 'variant' });

// Item Variants — trackable Color/Size/etc. combinations, each with its own
// SKU and stock balance (unbranched pool via ItemVariant itself, per-branch
// via ItemVariantBranchStock — same two-tier pattern as plain Items).
Item.hasMany(ItemVariant, { foreignKey: 'item_id', as: 'variants', onDelete: 'CASCADE' });
ItemVariant.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
ItemVariant.hasMany(ItemVariantBranchStock, { foreignKey: 'variant_id', as: 'branchStocks', onDelete: 'CASCADE' });
ItemVariantBranchStock.belongsTo(ItemVariant, { foreignKey: 'variant_id', as: 'variant' });
ItemVariantBranchStock.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Branch.hasMany(ItemVariantBranchStock, { foreignKey: 'branch_id', as: 'variantStocks' });

// Branch <-> Account (open-ended tag-style link — a branch can list any
// number of Chart-of-Accounts accounts it cares about, e.g. its own cash,
// revenue, or expense account, purely for reference/reporting).
Branch.belongsToMany(Account, { through: BranchAccount, foreignKey: 'branch_id', otherKey: 'account_id', as: 'accounts' });
Account.belongsToMany(Branch, { through: BranchAccount, foreignKey: 'account_id', otherKey: 'branch_id', as: 'branches' });

// Per-branch stock balances (multi-location weighted-average costing)
Item.hasMany(ItemBranchStock, { foreignKey: 'item_id', as: 'branchStocks', onDelete: 'CASCADE' });
ItemBranchStock.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
ItemBranchStock.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Branch.hasMany(ItemBranchStock, { foreignKey: 'branch_id', as: 'itemStocks' });

// Stock Transfers between two locations (a real Branch or the unbranched
// pool) — header (StockTransfer) + lines (StockTransferLine), so one transfer
// can move several items (and/or variants) at once, mirroring Invoice/PO.
StockTransfer.belongsTo(Branch, { foreignKey: 'from_branch_id', as: 'fromBranch' });
StockTransfer.belongsTo(Branch, { foreignKey: 'to_branch_id', as: 'toBranch' });
StockTransfer.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
StockTransfer.hasMany(StockTransferLine, { foreignKey: 'transfer_id', as: 'lines', onDelete: 'CASCADE' });
StockTransferLine.belongsTo(StockTransfer, { foreignKey: 'transfer_id' });
StockTransferLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
StockTransferLine.belongsTo(ItemVariant, { foreignKey: 'variant_id', as: 'variant' });

PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplier_id', as: 'supplier' });
PurchaseOrder.belongsTo(CostCenter, { foreignKey: 'cost_center_id', as: 'costCenter' });
PurchaseOrder.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
PurchaseOrder.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
PurchaseOrder.belongsTo(Invoice, { foreignKey: 'converted_invoice_id', as: 'convertedInvoice' });

PurchaseOrder.hasMany(PurchaseOrderLine, { foreignKey: 'purchase_order_id', as: 'lines', onDelete: 'CASCADE' });
PurchaseOrderLine.belongsTo(PurchaseOrder, { foreignKey: 'purchase_order_id' });
PurchaseOrderLine.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });
PurchaseOrderLine.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
PurchaseOrderLine.belongsTo(ItemVariant, { foreignKey: 'variant_id', as: 'variant' });

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
  EmployeeLeave,
  Vehicle,
  VehicleDocument,
  VehicleMaintenance,
  CashAccount,
  FiscalYear,
  Voucher,
  VoucherLine,
  LedgerEntry,
  Item,
  InventoryTransaction,
  PurchaseOrder,
  PurchaseOrderLine,
  Branch,
  BranchAccount,
  ItemBranchStock,
  StockTransfer,
  StockTransferLine,
  ItemVariant,
  ItemVariantBranchStock,
  ItemCategory,
};
