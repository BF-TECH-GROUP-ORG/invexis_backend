// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */

module.exports = {

  development: {
    client: 'pg',
    connection: {
      host: 'invexis-postgres',
      port: 5432,
      user: 'invexis',
      password: 'invexispass',
      database: 'paymentdb'
    },
    migrations: {
      tableName: 'Inexis_migrations',
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    }
  },

  staging: {
    client: 'pg',
    connection: {
      host: 'invexis-postgres',
      port: 5432,
      user: 'invexis',
      password: 'invexispass',
      database: 'invexisdb'
    },
    pool: {
      min: 2,
      max: 10
    },
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
    connection: {
      host: 'invexis-postgres',
      port: 5432,
      user: 'invexis',
      password: 'invexispass',
      database: 'invexisdb'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    }
  }

};
