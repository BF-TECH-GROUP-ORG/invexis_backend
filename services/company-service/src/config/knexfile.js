require("dotenv").config();
const { snakeCaseMappers } = require('objection');
/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
  development: {
    client: "pg",
    connection: {
      host: process.env.DEV_DB_HOST || "127.0.0.1",
      port: process.env.DEV_DB_PORT || 5432,
      database: process.env.DEV_DB_NAME || "company_service_dev",
      user: process.env.DEV_DB_USER || "invexis",
      password: process.env.DEV_DB_PASSWORD,
      ssl: process.env.DEV_DB_SSL === "true", // optional SSL
    },
    pool: {
      min: parseInt(process.env.DEV_DB_POOL_MIN) || 5,        // Increased from 2
      max: parseInt(process.env.DEV_DB_POOL_MAX) || 20,       // Increased from 10
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 5000,
    },
    migrations: {
      directory: "./migrations",
      tableName: "knex_migrations",
    },
    seeds: {
      directory: "./seeds",
    },
    ...snakeCaseMappers(),
  },

  staging: {
    client: "pg",
    connection: {
      host: process.env.STAGING_DB_HOST,
      port: process.env.STAGING_DB_PORT || 5432,
      database: process.env.STAGING_DB_NAME,
      user: process.env.STAGING_DB_USER,
      password: process.env.STAGING_DB_PASSWORD,
      ssl: process.env.STAGING_DB_SSL === "true",
    },
    pool: {
      min: parseInt(process.env.STAGING_DB_POOL_MIN) || 5,     // Increased from 2
      max: parseInt(process.env.STAGING_DB_POOL_MAX) || 20,    // Increased from 10
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 5000,
    },
    migrations: {
      directory: "./migrations",
      tableName: "knex_migrations",
    },
    seeds: {
      directory: "./seeds",
    },
    ...snakeCaseMappers(),
  },

  production: {
    client: "pg",
    connection: {
      host: process.env.PROD_DB_HOST,
      port: process.env.PROD_DB_PORT || 5432,
      database: process.env.PROD_DB_NAME,
      user: process.env.PROD_DB_USER,
      password: process.env.PROD_DB_PASSWORD,
      ssl: process.env.PROD_DB_SSL === "true",
    },
    pool: {
      min: parseInt(process.env.PROD_DB_POOL_MIN) || 10,       // Increased from 2
      max: parseInt(process.env.PROD_DB_POOL_MAX) || 30,       // Increased from 10
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 5000,
    },
    migrations: {
      directory: "./migrations",
      tableName: "knex_migrations",
    },
    seeds: {
      directory: "./seeds",
    },
    ...snakeCaseMappers(),
  },
};
