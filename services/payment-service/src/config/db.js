// src/config/db.js
// Centralized Knex database configuration and connection management

const knex = require('knex');
const knexConfig = require('../../knexfile');

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

// Create Knex instance
const db = knex(config);

// Test database connection
const testConnection = async () => {
    try {
        await db.raw('SELECT 1');
        console.log(`✓ Database connected successfully (${environment})`);
        return true;
    } catch (error) {
        console.error('✗ Database connection failed:', error.message);
        throw error;
    }
};

// Graceful shutdown
const closeConnection = async () => {
    try {
        await db.destroy();
        console.log('✓ Database connection closed');
    } catch (error) {
        console.error('✗ Error closing database connection:', error.message);
    }
};

module.exports = {
    db,
    testConnection,
    closeConnection
};
