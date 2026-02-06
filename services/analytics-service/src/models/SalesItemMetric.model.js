const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Money = require("/app/shared/utils/MoneyUtil");

/**
 * SalesItemMetric
 * Granular line-item sales data for "Category Performance" and deeper insights.
 * Hypertable.
 */
const SalesItemMetric = sequelize.define("SalesItemMetric", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        primaryKey: true, // Composite PK key for TimescaleDB
    },
    saleId: {
        type: DataTypes.TEXT, // Link to parent sale (sourceEventId basically)
        allowNull: false,
    },
    companyId: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    shopId: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    tier: {
        type: DataTypes.TEXT, // Denormalized Tier for fast querying
        defaultValue: "Basic",
    },
    productId: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    productName: {
        type: DataTypes.TEXT,
    },
    category: {
        type: DataTypes.TEXT,
        defaultValue: "Uncategorized",
    },
    quantity: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
    },
    unitPrice: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
        get() { return Money.toMajor(this.getDataValue('unitPrice')); },
        set(value) { this.setDataValue('unitPrice', Money.toMinor(value)); }
    },
    totalAmount: { // quantity * unitPrice
        type: DataTypes.BIGINT,
        defaultValue: 0,
        get() { return Money.toMajor(this.getDataValue('totalAmount')); },
        set(value) { this.setDataValue('totalAmount', Money.toMinor(value)); }
    },
    costPrice: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
        get() { return Money.toMajor(this.getDataValue('costPrice')); },
        set(value) { this.setDataValue('costPrice', Money.toMinor(value)); }
    },
    profit: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
        get() { return Money.toMajor(this.getDataValue('profit')); },
        set(value) { this.setDataValue('profit', Money.toMinor(value)); }
    }
}, {
    tableName: "sales_item_metrics",
    timestamps: false,
    indexes: [
        { fields: ['time'] },
        { fields: ['companyId'] },
        { fields: ['category'] },
        { fields: ['tier'] }
    ]
});

module.exports = SalesItemMetric;
