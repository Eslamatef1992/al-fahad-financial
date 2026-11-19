require('express-async-errors');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const auditLogger = require('./middleware/audit');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// Allowed browser origins: CLIENT_URL (comma separated) plus the POS sub-domain (pos.<same host>).
const allowedOrigins = (() => {
  const list = String(process.env.CLIENT_URL || '').split(',').map((x) => x.trim()).filter(Boolean);
  const extra = [];
  list.forEach((o) => { try { const u = new URL(o); extra.push(`${u.protocol}//pos.${u.host.replace(/^www\./, '')}`); } catch (e) { /* ignore */ } });
  return [...list, ...extra];
})();
app.use(cors({
  origin: allowedOrigins.length ? (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)) : '*',
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(auditLogger);

// Uploaded vehicle/employee documents served as static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/pos-auth', require('./routes/posAuthRoutes'));
app.use('/api/pos-operators', require('./routes/posOperatorRoutes'));
app.use('/api/companies', require('./routes/companyRoutes'));
app.use('/api/accounts', require('./routes/accountRoutes'));
app.use('/api/cost-centers', require('./routes/costCenterRoutes'));
app.use('/api/clients', require('./routes/clientRoutes'));
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/employee-leaves', require('./routes/employeeLeaveRoutes'));
app.use('/api/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/cash-accounts', require('./routes/cashAccountRoutes'));
app.use('/api/vouchers', require('./routes/voucherRoutes'));
app.use('/api/invoices', require('./routes/invoiceRoutes'));
app.use('/api/manufacture-orders', require('./routes/manufactureOrderRoutes'));
app.use('/api/manufacture-catalog', require('./routes/manufactureCatalogRoutes'));
app.use('/api/recurring-invoices', require('./routes/recurringInvoiceRoutes'));
app.use('/api/recurring-vouchers', require('./routes/recurringVoucherRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));
app.use('/api/item-categories', require('./routes/itemCategoryRoutes'));
app.use('/api/units', require('./routes/unitRoutes'));
app.use('/api/financial-settings', require('./routes/financialSettingRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/pos', require('./routes/posRoutes'));
app.use('/api/sales-targets', require('./routes/salesTargetRoutes'));
app.use('/api/gifts', require('./routes/giftRoutes'));
app.use('/api/warranty', require('./routes/warrantyRoutes'));
app.use('/api/movements', require('./routes/movementRoutes'));
app.use('/api/sales-people', require('./routes/salesPersonRoutes'));
app.use('/api/sales-returns', require('./routes/salesReturnRoutes'));
app.use('/api/damages', require('./routes/damageRoutes'));
app.use('/api/discount-codes', require('./routes/discountCodeRoutes'));
app.use('/api/purchase-orders', require('./routes/purchaseOrderRoutes'));
app.use('/api/branches', require('./routes/branchRoutes'));
app.use('/api/stock-transfers', require('./routes/stockTransferRoutes'));
app.use('/api/inventory-reports', require('./routes/inventoryReportRoutes'));
app.use('/api/manufacturers', require('./routes/manufacturerRoutes'));
app.use('/api/payment-methods', require('./routes/paymentMethodRoutes'));
app.use('/api/ledger', require('./routes/ledgerRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
