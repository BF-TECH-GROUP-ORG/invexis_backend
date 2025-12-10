const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Outbox = sequelize.define("Outbox", {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    routing_key: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    payload: {
        type: DataTypes.JSON, // Use JSON for flexibility
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM("PENDING", "SENT", "FAILED"),
        defaultValue: "PENDING",
    },
    error: {
        type: DataTypes.TEXT,
    },
    retries: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
}, {
    tableName: "outbox",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
});

module.exports = Outbox;
