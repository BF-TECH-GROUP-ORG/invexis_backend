// knexfile.js
// Updated for production-ready setup: Uses dotenv for env vars, aligns with docker-compose (host: payment-postgres, DB: paymentdb),
// supports high-traffic pooling, and disables SSL for dev/staging (since docker Postgres doesn't support it). 
// Prod still enforces SSL. Partitioning/examples assume current date (Oct 15, 2025).

const path = require('path');
require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'payment-postgres',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'invexis',
      password: process.env.DB_PASSWORD || 'invexispass',
      database: process.env.DB_NAME || 'paymentdb',
      ssl: false  // Disable SSL for dev (docker Postgres doesn't support it)
    },
    migrations: {
      tableName: 'knex_migrations',  // Standardized
      directory: path.join(__dirname, 'migrations')
    },
    seeds: {
      directory: path.join(__dirname, 'seeds')
    },
    pool: {
      min: parseInt(process.env.PG_POOL_MIN || '2'),
      max: parseInt(process.env.PG_POOL_MAX || '10')
    },
    acquireConnectionTimeout: parseInt(process.env.PG_ACQUIRE_TIMEOUT || '60000')
  },

  staging: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'payment-postgres',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'invexis',
      password: process.env.DB_PASSWORD || 'invexispass',
      database: process.env.DB_NAME || 'paymentdb',  // Use 'invexisdb' if preferred
      ssl: false  // Disable SSL for staging (docker Postgres doesn't support it)
    },
    pool: {
      min: parseInt(process.env.PG_POOL_MIN || '2'),
      max: parseInt(process.env.PG_POOL_MAX || '20')
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, 'migrations')
    },
    seeds: {
      directory: path.join(__dirname, 'seeds')
    },
    acquireConnectionTimeout: parseInt(process.env.PG_ACQUIRE_TIMEOUT || '60000')
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {  // Prefer full URL for prod (e.g., from cloud provider)
      host: process.env.DB_HOST || 'payment-postgres',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'invexis',
      password: process.env.DB_PASSWORD || 'invexispass',
      database: process.env.DB_NAME || 'paymentdb',
      ssl: { rejectUnauthorized: true }  // Prod: Enforce SSL
    },
    pool: {
      min: parseInt(process.env.PG_POOL_MIN || '2'),
      max: parseInt(process.env.PG_POOL_MAX || '20')
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, 'migrations')
    },
    seeds: {
      directory: path.join(__dirname, 'seeds')
    },
    acquireConnectionTimeout: parseInt(process.env.PG_ACQUIRE_TIMEOUT || '60000')
  }
};