const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
    process.env.DB_NAME || "analytics_db",
    process.env.DB_USER || "postgres",
    process.env.DB_PASSWORD || "postgres",
    {
        host: process.env.DB_HOST || "postgres", // or timescaledb if separate service
        dialect: "postgres",
        logging: false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000,
        },
    }
);

module.exports = sequelize;
