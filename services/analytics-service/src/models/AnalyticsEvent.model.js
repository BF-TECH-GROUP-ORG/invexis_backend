const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const AnalyticsEvent = sequelize.define("AnalyticsEvent", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    event_type: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    source_service: {
        type: DataTypes.TEXT,
    },
    payload: {
        type: DataTypes.JSONB, // Use JSONB for Postgres
    },
    metadata: {
        type: DataTypes.JSONB,
    },
    time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        primaryKey: true, // Composite PK for TimescaleDB
    }
}, {
    tableName: "analytics_events",
    timestamps: false, // We use 'time' column
    indexes: [
        {
            fields: ['event_type'],
        },
        {
            fields: ['time'], // Important for TimescaleDB
        }
    ],
});

module.exports = AnalyticsEvent;
