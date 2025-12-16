const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Shop = sequelize.define("Shop", {
    id: {
        type: DataTypes.TEXT,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    name: {
        type: DataTypes.TEXT,
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    }
}, {
    tableName: "shops",
    timestamps: true,
    indexes: [
        { fields: ['companyId'] },
        { fields: ['createdAt'] }
    ]
});

module.exports = Shop;
