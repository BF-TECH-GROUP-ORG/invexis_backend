  // models/Sale.js
  const { DataTypes } = require("sequelize");
  const sequelize = require("../config/db");

  const Sale = sequelize.define(
    "Sale",
    {
      saleId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      companyId: { type: DataTypes.UUID, allowNull: false },
      shopId: { type: DataTypes.UUID, allowNull: false },
      customerId: { type: DataTypes.BIGINT },
      soldBy: { type: DataTypes.BIGINT, allowNull: false },
      saleType: {
        type: DataTypes.ENUM("in_store", "ecommerce", "delivery"),
        defaultValue: "in_store",
      },
      status: {
        type: DataTypes.ENUM(
          "initiated",
          "validated",
          "processing",
          "completed",
          "canceled"
        ),
        defaultValue: "initiated",
      },
      subTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      discountTotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      taxTotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      paymentStatus: {
        type: DataTypes.ENUM("pending", "paid", "failed", "refunded"),
        defaultValue: "pending",
      },
      paymentMethod: {
        type: DataTypes.ENUM("cash", "card", "mobile", "wallet", "bank_transfer"),
      },
      paymentId: { type: DataTypes.BIGINT },
      customerName: { type: DataTypes.STRING },
      customerPhone: { type: DataTypes.STRING },
      customerAddress: { type: DataTypes.STRING },
    },
    {
      tableName: "sales",
      timestamps: true,
    }
  );

  module.exports = Sale;
