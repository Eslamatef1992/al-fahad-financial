const app = require('./app');
const sequelize = require('./config/db');
const models = require('./models'); // ensure associations are registered

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    // On managed platforms without shell access (e.g. Render free tier), set
    // AUTO_MIGRATE=true to create/update tables and seed starter data on boot.
    // Both operations are idempotent (sync uses alter, seed uses findOrCreate),
    // so it's safe to leave this on across repeated deploys.
    if (process.env.AUTO_MIGRATE === 'true') {
      console.log('AUTO_MIGRATE enabled — syncing schema...');
      await sequelize.sync({ alter: true });
      console.log('Schema synced. Running seed...');
      await require('./scripts/seedRunner')(models);
      console.log('Seed complete.');
    }

    app.listen(PORT, () => console.log(`Al Fahad Financial API running on port ${PORT}`));
  } catch (err) {
    console.error('Unable to start server:', err);
    process.exit(1);
  }
}

start();
