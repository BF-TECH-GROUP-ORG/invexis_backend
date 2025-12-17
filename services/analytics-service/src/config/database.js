const { Sequelize } = require("sequelize");

// Default to Docker Compose values
const DB_NAME = process.env.DB_NAME || "analyticsdb";
const DB_USER = process.env.DB_USER || "invexis";
const DB_PASSWORD = process.env.DB_PASSWORD || "invexispass";
const DB_HOST = process.env.DB_HOST || "analytics-postgres";
const DB_PORT = process.env.DB_PORT || 5432;

// ✅ Optimized Sequelize connection with enhanced pool settings
const sequelize = new Sequelize(
    DB_NAME,
    DB_USER,
    DB_PASSWORD,
    {
        host: DB_HOST,
        port: DB_PORT,
        dialect: "postgres",
        logging: false,
        pool: {
            max: 50,           // ✅ Increased from 5 for better concurrency
            min: 10,           // ✅ Maintain minimum connections
            acquire: 30000,
            idle: 10000,
            evict: 1000,       // ✅ Check for idle connections every 1s
        },
        dialectOptions: {
            connectTimeout: 10000, // ✅ Connection timeout
        },
    }
);

module.exports = sequelize;
