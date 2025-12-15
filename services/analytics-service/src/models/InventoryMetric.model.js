const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

/**
 * InventoryMetric
 * Tracks stock movements over time.
 */
const InventoryMetric = sequelize.define("InventoryMetric", {
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
        type: DataTypes.TEXT, // Optional (warehouse might not have shopId)
        allowNull: true,
    },
    productId: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    category: {
        type: DataTypes.TEXT,
        defaultValue: "Uncategorized",
    },
    changeAmount: {
        type: DataTypes.INTEGER, // Positive (restock) or negative (sale)
        allowNull: false,
    },
    currentStock: {
        type: DataTypes.INTEGER, // Stock level at this point in time
        allowNull: true,
    },
    operation: {
        type: DataTypes.TEXT, // 'sale', 'restock', 'return', 'adjustment'
    },
    sourceEventId: {
        type: DataTypes.TEXT,
    }
}, {
    tableName: "inventory_metrics",
    timestamps: false,
    indexes: [
        { fields: ['time'] },
        { fields: ['companyId'] },
        { fields: ['productId'] }
    ]
});

module.exports = InventoryMetric;
