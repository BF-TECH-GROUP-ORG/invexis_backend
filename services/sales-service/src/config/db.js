const { Sequelize } = require("sequelize");

// ✅ Optimized Sequelize connection with enhanced pool settings
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false, // Disable SQL query logging
    pool: {
      max: 50,              // ✅ Maximum connections in pool
      min: 10,              // ✅ Minimum connections in pool
      acquire: 30000,       // ✅ Max time (ms) to get connection before error
      idle: 10000,          // ✅ Max time (ms) connection can be idle before release
      evict: 1000,          // ✅ Check for idle connections every 1s
    },
    dialectOptions: {
      connectTimeout: 10000, // ✅ Connection timeout
    },
  }
);


module.exports = sequelize;
