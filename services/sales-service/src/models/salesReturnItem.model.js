<<<<<<< HEAD
// models/SalesReturnItem.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SalesReturnItem = sequelize.define(
  "SalesReturnItem",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    returnId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "sale_returns", // Table name
        key: "returnId",
      },
    },
    productId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    refundAmount: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
    },
  },
  {
    tableName: "sales_return_items",
    timestamps: true,
  }
);

module.exports = SalesReturnItem;
=======
module.exports = (sequelize, DataTypes) => {
  const SalesReturnItem = sequelize.define(
    "SalesReturnItem",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      returnId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "SalesReturns", // Table name
          key: "returnId",
        },
      },
      productId: {
        type: DataTypes.INTEGER, // Adjust to match your Product model
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      refundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
    },
    {
      tableName: "sales_return_items",
      timestamps: true,
    }
  );

  // Associations
  

  return SalesReturnItem;
};
>>>>>>> 55eb3af5e260dabebd54e7923b37bc5096e6e6ae
