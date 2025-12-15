const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

/**
 * SalesMetric
 * Flattened table optimized for TimescaleDB aggregation.
 * Populated by event consumer when 'sale.created' events arrive.
 */
const SalesMetric = sequelize.define("SalesMetric", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        primaryKey: true, // Composite PK for TimescaleDB
    },
    companyId: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    shopId: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },
    costAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0, // quanity * costPrice
    },
    profit: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0, // amount - costAmount
    },
    itemCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    customerId: {
        type: DataTypes.TEXT, // Nullable (guest checkout)
        allowNull: true,
    },
    paymentMethod: {
        type: DataTypes.TEXT,
    },
    employeeId: {
        type: DataTypes.TEXT, // soldBy from event
        allowNull: true,
    },
    sourceEventId: {
        type: DataTypes.TEXT, // Link back to raw event
    }
}, {
    tableName: "sales_metrics",
    timestamps: false,
    indexes: [
        { fields: ['time'] },
        { fields: ['companyId'] },
        { fields: ['shopId'] }
    ]
});

module.exports = SalesMetric;
