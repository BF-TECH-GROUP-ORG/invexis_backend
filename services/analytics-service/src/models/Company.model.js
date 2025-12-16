const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Company = sequelize.define("Company", {
    id: {
        type: DataTypes.TEXT, // UUID from company-service
        primaryKey: true,
    },
    name: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    tier: {
        type: DataTypes.TEXT,
        defaultValue: "Basic",
    },
    status: {
        type: DataTypes.TEXT,
        defaultValue: "pending_verification",
    },
    registrationDate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    categoryIds: {
        type: DataTypes.JSONB, // Array of category IDs
        defaultValue: [],
    },
    lastActivity: {
        type: DataTypes.DATE,
    }
}, {
    tableName: "companies",
    timestamps: true, // adds createdAt, updatedAt
    indexes: [
        { fields: ['tier'] },
        { fields: ['status'] },
        { fields: ['createdAt'] }
    ]
});

module.exports = Company;
