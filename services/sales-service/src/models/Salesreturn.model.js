// models/SaleReturn.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Money = require("/app/shared/utils/MoneyUtil");

const SaleReturn = sequelize.define(
  "SaleReturn",
  {
    returnId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    saleId: { type: DataTypes.BIGINT, allowNull: false },
    reason: { type: DataTypes.STRING },
    refundAmount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      get() { return Money.toMajor(this.getDataValue('refundAmount')); },
      set(value) { this.setDataValue('refundAmount', Money.toMinor(value)); }
    },
    status: {
      type: DataTypes.ENUM("initiated", "partially_returned", "fully_returned", "rejected"),
      defaultValue: "initiated",
    },
  },
  {
    tableName: "sale_returns",
    timestamps: true,
  }
);

module.exports = SaleReturn;
