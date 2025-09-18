const { Sequelize } = require("sequelize");

const sequelize = new Sequelize("invexis_sales", "root", "", {
  host: "localhost",
  dialect: "mysql",
  logging: false, // disable SQL logs
});

module.exports = sequelize;
