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
