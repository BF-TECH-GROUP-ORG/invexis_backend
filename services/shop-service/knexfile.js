require('dotenv').config();

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'shop_service_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    },
    pool: { min: 2, max: 10 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    }
  },

  staging: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'shop_service_staging',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    },
    pool: { min: 2, max: 10 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    }
  },

  production: {
    client: 'pg',
    connection: process.env.DB_POSTGRES || {
      host: process.env.DB_HOST || 'shop-postgres',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'shopdb',
      user: process.env.DB_USER || 'invexis',
      password: process.env.DB_PASSWORD || ''
    },
    pool: { min: 2, max: 10 },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    }
  }
};
