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
    // Removed companyId - now system-wide
    associatedCompanyIds: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: false,
      comment: "Array of company UUIDs this user has interacted with",
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
      unique: true, // System-wide unique phone
      comment: "Customer phone - unique system-wide",
    },
    customerEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true, // System-wide unique email (if provided)
      comment: "Customer email - optional but unique system-wide",
    },
    customerAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Customer address - optional",
    },

    // Stable hashed identifier for this customer (used by debt-service / cross-company)
    hashedCustomerId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      comment: "Hashed customer identifier derived from phone/email",
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
        fields: ["customerId"],
        name: "idx_known_users_customer_id",
      },
      {
        fields: ["customerPhone"],
        name: "idx_known_users_phone",
      },
      {
        fields: ["customerEmail"],
        name: "idx_known_users_email",
      },
    ],
  }
);

module.exports = KnownUser;

