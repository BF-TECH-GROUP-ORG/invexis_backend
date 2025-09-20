// models/SaleReturn.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SaleReturn = sequelize.define(
  "SaleReturn",
  {
    returnId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    saleId: { type: DataTypes.BIGINT, allowNull: false },
    reason: { type: DataTypes.STRING },
    refundAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    status: {
      type: DataTypes.ENUM("initiated", "processed", "rejected"),
      defaultValue: "initiated",
    },
  },
  {
    tableName: "sale_returns",
    timestamps: true,
  }
);

module.exports = SaleReturn;
