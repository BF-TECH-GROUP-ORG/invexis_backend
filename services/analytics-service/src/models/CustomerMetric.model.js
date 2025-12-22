const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const CustomerMetric = sequelize.define(
    "CustomerMetric",
    {
        time: {
            type: DataTypes.DATE,
            primaryKey: true,
            allowNull: false,
        },
        companyId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        hashedCustomerId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM('ACQUISITION', 'PURCHASE', 'RETURN', 'DEBT_INC', 'DEBT_DEC', 'CHURN_RISK'),
            allowNull: false,
        },
        value: {
            type: DataTypes.DECIMAL(12, 2), // Positive for revenue/debt, negative for returns/payments
            allowNull: false,
            defaultValue: 0,
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true, // Stores campaignId, source, reason, etc.
        },
        sourceEventId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        tableName: "customer_metrics",
        timestamps: false,
        indexes: [
            {
                fields: ["companyId", "hashedCustomerId", "time"],
            },
            {
                fields: ["type", "time"],
            },
        ],
    }
);

module.exports = CustomerMetric;
