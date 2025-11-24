// models/Sales.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Sale = sequelize.define(
  "Sale",
  {
    saleId: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: false },
    shopId: { type: DataTypes.STRING, allowNull: false },
    knownUserId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: "Reference to KnownUser - stores all customer info",
    },
    soldBy: { type: DataTypes.STRING, allowNull: false },
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
    paymentId: { type: DataTypes.BIGINT, defaultValue: 1 },
  },
  {
    tableName: "sales",
    timestamps: true,
    indexes: [
      {
        fields: ["companyId"],
        name: "idx_sales_company_id",
      },
      {
        fields: ["knownUserId"],
        name: "idx_sales_known_user_id",
      },
      {
        fields: ["companyId", "createdAt"],
        name: "idx_sales_company_date",
      },
    ],
  }
);

module.exports = Sale;
