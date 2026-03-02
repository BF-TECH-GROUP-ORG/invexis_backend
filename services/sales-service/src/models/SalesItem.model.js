// models/SaleItem.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Money = require("/app/shared/utils/MoneyUtil");

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
    originalQuantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Original quantity sold (before any returns) - used for validation"
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false, comment: "Current quantity (after returns deducted)" },
    returnedQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Quantity that has been returned from this sale item"
    },
    unitPrice: {
      type: DataTypes.BIGINT,
      allowNull: false,
      get() { return Money.toMajor(this.getDataValue('unitPrice')); },
      set(value) { this.setDataValue('unitPrice', Money.toMinor(value)); }
    },
    costPrice: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      get() { return Money.toMajor(this.getDataValue('costPrice')); },
      set(value) { this.setDataValue('costPrice', Money.toMinor(value)); }
    },
    discount: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      get() { return Money.toMajor(this.getDataValue('discount')); },
      set(value) { this.setDataValue('discount', Money.toMinor(value)); }
    },
    tax: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      get() { return Money.toMajor(this.getDataValue('tax')); },
      set(value) { this.setDataValue('tax', Money.toMinor(value)); }
    },
    total: {
      type: DataTypes.BIGINT,
      allowNull: false,
      get() { return Money.toMajor(this.getDataValue('total')); },
      set(value) { this.setDataValue('total', Money.toMinor(value)); }
    },
  },
  {
    tableName: "sale_items",
    timestamps: true,
  }
);

module.exports = SaleItem;
