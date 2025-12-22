const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

/**
 * DebtMetric
 * Dimensional model for financial health analysis regarding debts.
 * Optimized for TimescaleDB aggregation.
 */
const DebtMetric = sequelize.define("DebtMetric", {
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
    customerId: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    debtId: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    type: {
        type: DataTypes.ENUM('CREATED', 'PAYMENT', 'SETTLED', 'OVERDUE', 'UPDATED'),
        allowNull: false,
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Transactional amount (positive for debt created, negative for payment)"
    },
    balance: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Remaining balance after this transaction"
    },
    daysOverdue: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: "Only relevant for OVERDUE events"
    },
    metadata: {
        type: DataTypes.JSONB,
        defaultValue: {}
    },
    sourceEventId: {
        type: DataTypes.TEXT, // Link back to raw event
    }
}, {
    tableName: "debt_metrics",
    timestamps: false,
    indexes: [
        { fields: ['time'] },
        { fields: ['companyId'] },
        { fields: ['shopId'] },
        { fields: ['customerId'] },
        { fields: ['type'] }
    ]
});

module.exports = DebtMetric;
