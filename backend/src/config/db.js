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
sequelize.addHook('beforeValidate', (instance) => {
  const attrs = instance?.constructor?.rawAttributes;
  if (!attrs) return;
  for (const key of Object.keys(attrs)) {
    const typeKey = attrs[key].type?.key;
    if ((typeKey === 'DATEONLY' || typeKey === 'DATE') && instance.dataValues[key] === '') {
      instance.dataValues[key] = null;
    }
  }
});

module.exports = sequelize;
