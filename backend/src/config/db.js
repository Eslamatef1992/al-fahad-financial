const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  }
);

// Forms across the app leave optional date fields (hire_date, license_expiry,
// registration_expiry, due_date, etc.) as an empty string '' when left blank,
// rather than omitting them entirely. Postgres rejects '' for DATE/DATEONLY
// columns outright ("invalid input syntax for type date"), which surfaced as a
// hard failure on things like adding a non-driver employee. Rather than patch
// every form/controller individually, sanitize it once here for every model:
// blank string on a date-typed column becomes null before Sequelize validates.
// Same failure mode applies to numeric columns (salary, vacation/sick-leave
// balances, deduction, etc.): a blank number input submits '' rather than
// being omitted, and Postgres rejects '' for DECIMAL/INTEGER/FLOAT columns
// ("invalid input syntax for type numeric"). Blank numeric fields become
// null here too, alongside the date handling above.
const BLANKABLE_TYPES = new Set(['DATEONLY', 'DATE', 'DECIMAL', 'FLOAT', 'INTEGER', 'BIGINT', 'DOUBLE']);
sequelize.addHook('beforeValidate', (instance) => {
  const attrs = instance?.constructor?.rawAttributes;
  if (!attrs) return;
  for (const key of Object.keys(attrs)) {
    const typeKey = attrs[key].type?.key;
    if (BLANKABLE_TYPES.has(typeKey) && instance.dataValues[key] === '') {
      instance.dataValues[key] = null;
    }
  }
});

module.exports = sequelize;
