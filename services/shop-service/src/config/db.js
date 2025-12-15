const knex = require("knex");
const knexfile = require("../../knexfile");

const environment = process.env.NODE_ENV || "development";
const config = knexfile[environment];

const db = knex(config);

/**
 * Test database connection
 */
const testConnection = async () => {
  try {
    await db.raw("SELECT 1");
    console.log("✅ Database connection successful");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    throw error;
  }
};

/**
 * Run migrations
 */
const runMigrations = async () => {
  try {
    await db.migrate.latest();
    console.log("✅ Migrations completed");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    throw error;
  }
};

module.exports = db;
module.exports.testConnection = testConnection;
module.exports.runMigrations = runMigrations;
