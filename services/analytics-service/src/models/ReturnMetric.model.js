const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ReturnMetric = sequelize.define(
    "ReturnMetric",
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
        shopId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        returnId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        saleId: {
            type: DataTypes.STRING,
            allowNull: false,
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
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        category: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
    },
    {
        tableName: "return_metrics",
        timestamps: false,
        indexes: [
            {
                fields: ["companyId", "time"],
            },
            {
                fields: ["shopId", "time"],
            },
            {
                fields: ["productId", "time"],
            },
        ],
    }
);

module.exports = ReturnMetric;
