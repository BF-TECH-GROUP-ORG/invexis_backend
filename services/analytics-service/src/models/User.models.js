const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define("User", {
    id: {
        type: DataTypes.TEXT,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.TEXT,
        allowNull: true, // Super admins might not have company
    },
    username: {
        type: DataTypes.TEXT,
    },
    email: {
        type: DataTypes.TEXT,
    },
    role: {
        type: DataTypes.TEXT,
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    }
}, {
    tableName: "users",
    timestamps: true,
    indexes: [
        { fields: ['companyId'] },
        { fields: ['role'] }
    ]
});

module.exports = User;
