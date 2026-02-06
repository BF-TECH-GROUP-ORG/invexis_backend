const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Money = require("/app/shared/utils/MoneyUtil");

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
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        get() { return Money.toMajor(this.getDataValue('amount')); },
        set(value) { this.setDataValue('amount', Money.toMinor(value)); }
    },
    costAmount: {
        type: DataTypes.BIGINT,
        defaultValue: 0, // quanity * costPrice
        get() { return Money.toMajor(this.getDataValue('costAmount')); },
        set(value) { this.setDataValue('costAmount', Money.toMinor(value)); }
    },
    profit: {
        type: DataTypes.BIGINT,
        defaultValue: 0, // amount - costAmount
        get() { return Money.toMajor(this.getDataValue('profit')); },
        set(value) { this.setDataValue('profit', Money.toMinor(value)); }
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
