// Standalone CLI: `npm run db:seed`
require('dotenv').config();
const sequelize = require('../config/db');
const models = require('../models');
const runSeed = require('./seedRunner');

(async () => {
  try {
    await sequelize.sync();
    await runSeed(models);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
})();
