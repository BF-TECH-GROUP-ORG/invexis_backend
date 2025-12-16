// models/SaleItem.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SaleItem = sequelize.define(
  "SaleItem",
  {
    saleItemId: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    saleId: { type: DataTypes.BIGINT, allowNull: false },
    productId: { type: DataTypes.STRING, allowNull: false },
    productName: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, defaultValue: "Uncategorized" },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    unitPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    costPrice: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    discount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    tax: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  },
  {
    tableName: "sale_items",
    timestamps: true,
  }
);

module.exports = SaleItem;
