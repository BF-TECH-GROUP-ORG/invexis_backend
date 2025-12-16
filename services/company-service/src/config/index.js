const knex = require('knex');
const { snakeCaseMappers } = require('objection');
const config = require('./knexfile');
const env = process.env.NODE_ENV || 'development';
module.exports = knex(config[env]);
