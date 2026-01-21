const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ProcessedEvent = sequelize.define('ProcessedEvent', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
    },
    eventId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    eventType: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    processedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, {
    tableName: 'processed_events',
    timestamps: false,
    indexes: [
        {
            unique: true,
            fields: ['eventId', 'eventType']
        }
    ]
});

module.exports = ProcessedEvent;
