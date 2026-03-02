// models/SalesReturnItem.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Money = require("/app/shared/utils/MoneyUtil");

const SalesReturnItem = sequelize.define(
  "SalesReturnItem",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    returnId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "sale_returns", // Table name
        key: "returnId",
      },
    },
    productId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    refundAmount: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      get() { return Money.toMajor(this.getDataValue('refundAmount')); },
      set(value) { this.setDataValue('refundAmount', Money.toMinor(value)); }
    },
  },
  {
    tableName: "sales_return_items",
    timestamps: true,
  }
);

module.exports = SalesReturnItem;
