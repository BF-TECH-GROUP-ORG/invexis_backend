// models/KnownUser.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const KnownUser = sequelize.define(
  "KnownUser",
  {
    knownUserId: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    customerId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: "Reference to ecommerce customer (null if not from ecommerce)",
    },
    customerName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Customer name - mandatory",
    },
    customerPhone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "Customer phone - mandatory",
    },
    customerEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Customer email - mandatory",
    },
    customerAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Customer address - optional",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Soft delete flag",
    },
  },
  {
    tableName: "known_users",
    timestamps: true,
    indexes: [
      {
        fields: ["companyId"],
        name: "idx_known_users_company_id",
      },
      {
        fields: ["customerId"],
        name: "idx_known_users_customer_id",
      },
      {
        fields: ["companyId", "customerPhone"],
        name: "idx_known_users_company_phone",
        unique: true,
        comment: "Unique phone per company to avoid duplicity",
      },
      {
        fields: ["companyId", "customerEmail"],
        name: "idx_known_users_company_email",
        unique: true,
        comment: "Unique email per company to avoid duplicity",
      },
    ],
  }
);

module.exports = KnownUser;

