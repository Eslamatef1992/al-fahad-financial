const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, Vehicle, Employee, VehicleDocument, VehicleMaintenance, Account, Company } = require('../models');
const { toPublicPath } = require('../middleware/upload');
const { createLinkedAccount, syncLinkedAccount } = require('../utils/linkedAccount');
const { nextCode } = require('../utils/codeGenerator');
const { exportVehicles } = require('../services/excelService');
const { generateVehiclesPdf } = require('../services/pdfService');

const include = [
  { model: Employee, as: 'driver', attributes: ['id', 'name_en', 'name_ar', 'phone', 'license_no', 'license_expiry'] },
  { model: VehicleDocument, as: 'documents' },
  { model: VehicleMaintenance, as: 'maintenanceRecords' },
  { model: Account, as: 'account' },
  { model: Account, as: 'secondaryAccount' },
  { model: Account, as: 'tertiaryAccount' },
];

exports.list = async (req, res) => {
  const { status } = req.query;
  const where = { company_id: req.companyId };
  // Deactivated vehicles are hidden by default so "delete" actually disappears from the list.
  if (status === 'all') { /* show every status */ }
  else if (status) where.status = status;
  else where.status = { [Op.ne]: 'inactive' };
  const vehicles = await Vehicle.findAll({ where, include, order: [['createdAt', 'DESC']] });
  res.json(vehicles);
};

exports.get = async (req, res) => {
  const vehicle = await Vehicle.findOne({ where: { id: req.params.id, company_id: req.companyId }, include });
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
  res.json(vehicle);
};

exports.exportExcel = async (req, res) => {
  const rows = await Vehicle.findAll({ where: { company_id: req.companyId, status: { [Op.ne]: 'inactive' } }, include, order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  await exportVehicles(res, company, rows);
};

exports.pdf = async (req, res) => {
  const rows = await Vehicle.findAll({ where: { company_id: req.companyId, status: { [Op.ne]: 'inactive' } }, include, order: [['code', 'ASC']] });
  const company = await Company.findByPk(req.companyId);
  generateVehiclesPdf(res, rows, company);
};

// Creating a vehicle always gets a system-generated code (VEH-00001, VEH-00002, ...) —
// any vehicle-supplied code is ignored. It can optionally also auto-create up to three
// ledger sub-accounts:
// - `account_id` nested under `parent_account_id` (e.g. a "Vehicles" asset group)
// - `secondary_account_id` nested under `secondary_parent_account_id`
// - `tertiary_account_id` nested under `tertiary_parent_account_id`
// For the second and third, the admin picks whichever parent it should sit under
// (maintenance costs, financing/loan payable, etc. — a free choice, not a fixed
// category); each is a separate real account with its own single parent, so Chart of
// Accounts balances never double-count across branches like they would if the same
// account were nested under more than one parent at once.
exports.create = async (req, res) => {
  const { parent_account_id, secondary_parent_account_id, tertiary_parent_account_id, code, ...body } = req.body;
  const created = await sequelize.transaction(async (t) => {
    const finalCode = await nextCode(Vehicle, req.companyId, 'VEH');
    let account_id = null;
    if (parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: parent_account_id,
        code: finalCode, name_en: body.plate_no || finalCode, name_ar: body.plate_no || finalCode,
        opening_balance: body.purchase_cost,
      }, t);
      account_id = account.id;
    }
    let secondary_account_id = null;
    if (secondary_parent_account_id) {
      const secondaryAccount = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: secondary_parent_account_id,
        code: `${finalCode}-2`, name_en: body.plate_no || finalCode, name_ar: body.plate_no || finalCode,
        opening_balance: 0,
      }, t);
      secondary_account_id = secondaryAccount.id;
    }
    let tertiary_account_id = null;
    if (tertiary_parent_account_id) {
      const tertiaryAccount = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: tertiary_parent_account_id,
        code: `${finalCode}-3`, name_en: body.plate_no || finalCode, name_ar: body.plate_no || finalCode,
        opening_balance: 0,
      }, t);
      tertiary_account_id = tertiaryAccount.id;
    }
    return Vehicle.create({ ...body, code: finalCode, account_id, secondary_account_id, tertiary_account_id, company_id: req.companyId }, { transaction: t });
  });
  const withAccount = await Vehicle.findOne({ where: { id: created.id }, include });
  res.status(201).json(withAccount);
};

exports.update = async (req, res) => {
  const { parent_account_id, secondary_parent_account_id, tertiary_parent_account_id, code, ...body } = req.body; // code is immutable after creation
  const vehicle = await Vehicle.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  await sequelize.transaction(async (t) => {
    let account_id = vehicle.account_id;
    if (!account_id && parent_account_id) {
      const account = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: parent_account_id,
        code: vehicle.code, name_en: body.plate_no || vehicle.code, name_ar: body.plate_no || vehicle.code,
        opening_balance: body.purchase_cost,
      }, t);
      account_id = account.id;
    } else if (account_id) {
      await syncLinkedAccount(account_id, {
        name_en: body.plate_no, name_ar: body.plate_no,
        opening_balance: body.purchase_cost, parent_id: parent_account_id,
      }, t);
    }

    let secondary_account_id = vehicle.secondary_account_id;
    if (!secondary_account_id && secondary_parent_account_id) {
      const secondaryAccount = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: secondary_parent_account_id,
        code: `${vehicle.code}-2`, name_en: body.plate_no || vehicle.code, name_ar: body.plate_no || vehicle.code,
        opening_balance: 0,
      }, t);
      secondary_account_id = secondaryAccount.id;
    } else if (secondary_account_id) {
      await syncLinkedAccount(secondary_account_id, {
        name_en: body.plate_no, name_ar: body.plate_no, parent_id: secondary_parent_account_id,
      }, t);
    }

    let tertiary_account_id = vehicle.tertiary_account_id;
    if (!tertiary_account_id && tertiary_parent_account_id) {
      const tertiaryAccount = await createLinkedAccount({
        companyId: req.companyId, parentAccountId: tertiary_parent_account_id,
        code: `${vehicle.code}-3`, name_en: body.plate_no || vehicle.code, name_ar: body.plate_no || vehicle.code,
        opening_balance: 0,
      }, t);
      tertiary_account_id = tertiaryAccount.id;
    } else if (tertiary_account_id) {
      await syncLinkedAccount(tertiary_account_id, {
        name_en: body.plate_no, name_ar: body.plate_no, parent_id: tertiary_parent_account_id,
      }, t);
    }

    await vehicle.update({ ...body, account_id, secondary_account_id, tertiary_account_id }, { transaction: t });
  });

  const updated = await Vehicle.findOne({ where: { id: vehicle.id }, include });
  res.json(updated);
};

exports.remove = async (req, res) => {
  const vehicle = await Vehicle.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
  await vehicle.update({ status: 'inactive' });
  res.json({ message: 'Vehicle deactivated' });
};

// Assign / unassign a driver
exports.assignDriver = async (req, res) => {
  const vehicle = await Vehicle.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
  const { driverId } = req.body; // null to unassign

  if (driverId) {
    const driver = await Employee.findOne({ where: { id: driverId, company_id: req.companyId } });
    if (!driver) return res.status(400).json({ message: 'Driver (employee) not found' });
    if (!driver.is_driver) return res.status(400).json({ message: 'Selected employee is not marked as a driver' });
  }

  await vehicle.update({ assigned_driver_id: driverId || null });
  const updated = await Vehicle.findByPk(vehicle.id, { include });
  res.json(updated);
};

// Documents - accepts an uploaded file (multipart, field name "file") alongside
// the doc_type/doc_number/issue_date/expiry_date form fields.
exports.addDocument = async (req, res) => {
  const vehicle = await Vehicle.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  const file_url = req.file ? toPublicPath(req.file, req.companyId, 'vehicle-documents') : (req.body.file_url || null);
  const file_name = req.file ? req.file.originalname : null;

  const doc = await VehicleDocument.create({
    vehicle_id: vehicle.id,
    doc_type: req.body.doc_type,
    doc_number: req.body.doc_number || null,
    issue_date: req.body.issue_date || null,
    expiry_date: req.body.expiry_date || null,
    notes: req.body.notes || null,
    file_url,
    file_name,
  });
  res.status(201).json(doc);
};

exports.removeDocument = async (req, res) => {
  const doc = await VehicleDocument.findOne({ where: { id: req.params.docId, vehicle_id: req.params.id } });
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  if (doc.file_url) {
    const filePath = path.join(__dirname, '..', doc.file_url.replace(/^\/uploads\//, 'uploads/'));
    fs.unlink(filePath, () => {}); // best-effort cleanup, ignore errors
  }

  await doc.destroy();
  res.json({ message: 'Document removed' });
};

// Maintenance
exports.addMaintenance = async (req, res) => {
  const vehicle = await Vehicle.findOne({ where: { id: req.params.id, company_id: req.companyId } });
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
  const record = await VehicleMaintenance.create({ ...req.body, vehicle_id: vehicle.id });
  if (req.body.odometer && Number(req.body.odometer) > Number(vehicle.current_odometer)) {
    await vehicle.update({ current_odometer: req.body.odometer });
  }
  res.status(201).json(record);
};

exports.removeMaintenance = async (req, res) => {
  const record = await VehicleMaintenance.findOne({ where: { id: req.params.recId, vehicle_id: req.params.id } });
  if (!record) return res.status(404).json({ message: 'Maintenance record not found' });
  await record.destroy();
  res.json({ message: 'Maintenance record removed' });
};
