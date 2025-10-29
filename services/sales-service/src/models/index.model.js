const Sale = require("./Sales.model");
const SalesItem = require("./SalesItem.model");
const SalesReturn = require("./Salesreturn.model");
const Invoice = require("./Invoice.model");
const SalesReturnItem = require("./salesReturnItem.model");

// Associations
Sale.hasMany(SalesItem, {
  foreignKey: "saleId",
  as: "items",
  onDelete: "CASCADE",
});
SalesItem.belongsTo(Sale, { foreignKey: "saleId", as: "sale" });

Sale.hasMany(SalesReturn, {
  foreignKey: "saleId",
  as: "returns",
  onDelete: "CASCADE",
});
SalesReturn.belongsTo(Sale, { foreignKey: "saleId", as: "sale" });
Sale.hasOne(Invoice, {
  foreignKey: "saleId",
  as: "invoice",
  onDelete: "CASCADE",
});

Invoice.belongsTo(Sale, {
  foreignKey: "saleId",
  as: "sale",
});
SalesReturnItem.associate = (models) => {
  SalesReturnItem.belongsTo(models.SalesReturn, { foreignKey: "returnId" });
};
module.exports = { Sale, SalesItem, SalesReturn, Invoice, SalesReturnItem };
