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
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use(auditLogger);

// Uploaded vehicle/employee documents served as static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/companies', require('./routes/companyRoutes'));
app.use('/api/accounts', require('./routes/accountRoutes'));
app.use('/api/cost-centers', require('./routes/costCenterRoutes'));
app.use('/api/clients', require('./routes/clientRoutes'));
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/vehicles', require('./routes/vehicleRoutes'));
app.use('/api/cash-accounts', require('./routes/cashAccountRoutes'));
app.use('/api/vouchers', require('./routes/voucherRoutes'));
app.use('/api/ledger', require('./routes/ledgerRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
