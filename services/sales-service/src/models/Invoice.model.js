// models/Invoice.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Invoice = sequelize.define(
  "Invoice",
  {
    invoiceId: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    saleId: { type: DataTypes.BIGINT, allowNull: false },

    invoiceNumber: { type: DataTypes.STRING, allowNull: false },
    issueDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    dueDate: { type: DataTypes.DATE },

    subTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    discountTotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    taxTotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },

    status: {
      type: DataTypes.ENUM("issued", "paid", "overdue", "canceled"),
      defaultValue: "issued",
    },

    pdfUrl: { type: DataTypes.STRING }, // optional link to stored PDF
  },
  {
    tableName: "invoices",
    timestamps: true,
  }
);

module.exports = Invoice;
