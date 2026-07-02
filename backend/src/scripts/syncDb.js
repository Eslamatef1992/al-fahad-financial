// Creates/updates all tables in the target PostgreSQL database based on the Sequelize models.
// For production, prefer proper migrations; this is provided for quick setup/dev use.
require('dotenv').config();
const sequelize = require('../config/db');
require('../models');

(async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Database schema synced successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Sync failed:', err);
    process.exit(1);
  }
})();
