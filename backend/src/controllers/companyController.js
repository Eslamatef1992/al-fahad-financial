const fs = require('fs');
const path = require('path');
const {
  sequelize, Company, UserCompany, AuditLog,
  Account, CostCenter, Client, Supplier, Employee, EmployeeLeave,
  Vehicle, VehicleDocument, VehicleMaintenance, CashAccount, FiscalYear,
  Voucher, VoucherLine, LedgerEntry,
  Invoice, InvoiceLine, InvoicePayment, RecurringInvoice, RecurringInvoiceLine,
} = require('../models');
const { toPublicPath } = require('../middleware/upload');

exports.list = async (req, res) => {
  const companies = await Company.findAll({ order: [['name_en', 'ASC']] });
  res.json(companies);
};

exports.create = async (req, res) => {
  const company = await Company.create(req.body);
  res.status(201).json(company);
};

exports.update = async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  await company.update(req.body);
  res.json(company);
};

// First delete just deactivates the company (safe, reversible via edit). Deleting an
// already-inactive company is treated as a confirmed second click and permanently wipes
// the company and every row that belongs to it — vouchers, ledger, invoices, employees,
// vehicles, clients, suppliers, cost centers, chart of accounts, everything. Deletion
// order matters: child/leaf tables are removed before whatever they reference, so this
// never violates a foreign key even on databases where the FK constraints are enforced.
exports.remove = async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) return res.status(404).json({ message: 'Company not found' });

  if (company.is_active) {
    await company.update({ is_active: false });
    return res.json({ message: 'Company deactivated' });
  }

  await sequelize.transaction(async (t) => {
    const where = { company_id: company.id };

    const voucherIds = (await Voucher.findAll({ where, attributes: ['id'], transaction: t })).map((v) => v.id);
    const invoiceIds = (await Invoice.findAll({ where, attributes: ['id'], transaction: t })).map((i) => i.id);
    const recurringInvoiceIds = (await RecurringInvoice.findAll({ where, attributes: ['id'], transaction: t })).map((r) => r.id);
    const vehicleIds = (await Vehicle.findAll({ where, attributes: ['id'], transaction: t })).map((v) => v.id);

    if (voucherIds.length) await LedgerEntry.destroy({ where: { voucher_id: voucherIds }, transaction: t });
    await LedgerEntry.destroy({ where, transaction: t }); // catches any without a voucher_id set
    if (invoiceIds.length) await InvoicePayment.destroy({ where: { invoice_id: invoiceIds }, transaction: t });
    if (voucherIds.length) await VoucherLine.destroy({ where: { voucher_id: voucherIds }, transaction: t });
    if (invoiceIds.length) await InvoiceLine.destroy({ where: { invoice_id: invoiceIds }, transaction: t });
    if (recurringInvoiceIds.length) await RecurringInvoiceLine.destroy({ where: { recurring_invoice_id: recurringInvoiceIds }, transaction: t });
    if (vehicleIds.length) {
      await VehicleDocument.destroy({ where: { vehicle_id: vehicleIds }, transaction: t });
      await VehicleMaintenance.destroy({ where: { vehicle_id: vehicleIds }, transaction: t });
    }
    await EmployeeLeave.destroy({ where, transaction: t });

    await Invoice.destroy({ where, transaction: t });
    await RecurringInvoice.destroy({ where, transaction: t });
    await Voucher.destroy({ where, transaction: t });
    await Vehicle.destroy({ where, transaction: t });
    await CashAccount.destroy({ where, transaction: t });
    await Employee.destroy({ where, transaction: t });
    await Client.destroy({ where, transaction: t });
    await Supplier.destroy({ where, transaction: t });
    await CostCenter.destroy({ where, transaction: t });
    await Account.destroy({ where, transaction: t });
    await FiscalYear.destroy({ where, transaction: t });
    await AuditLog.destroy({ where, transaction: t });
    await UserCompany.destroy({ where, transaction: t });

    await company.destroy({ transaction: t });
  });

  res.json({ message: 'Company permanently deleted' });
};

// Uploads/replaces a company's logo. Stored as an actual file (not base64 in the DB)
// so it can be read straight off disk when stamping PDFs (invoices, vouchers, reports).
exports.uploadLogo = async (req, res) => {
  const company = await Company.findByPk(req.params.id);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  // Best-effort cleanup of the previous logo file so they don't pile up.
  if (company.logo_url) {
    const oldPath = path.join(__dirname, '..', company.logo_url.replace(/^\/uploads\//, 'uploads/'));
    fs.unlink(oldPath, () => {});
  }

  const logo_url = toPublicPath(req.file, company.id, 'logo');
  await company.update({ logo_url });
  res.json(company);
};
