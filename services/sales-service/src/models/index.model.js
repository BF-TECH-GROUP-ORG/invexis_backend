const Sale = require("./Sale");
const SaleItem = require("./SaleItem");
const SaleReturn = require("./SaleReturn");
const Invoice = require("./Invoice");

// Associations
Sale.hasMany(SaleItem, {
  foreignKey: "saleId",
  as: "items",
  onDelete: "CASCADE",
});
SaleItem.belongsTo(Sale, { foreignKey: "saleId", as: "sale" });

Sale.hasMany(SaleReturn, {
  foreignKey: "saleId",
  as: "returns",
  onDelete: "CASCADE",
});
SaleReturn.belongsTo(Sale, { foreignKey: "saleId", as: "sale" });
Sale.hasOne(Invoice, {
  foreignKey: "saleId",
  as: "invoice",
  onDelete: "CASCADE",
});

Invoice.belongsTo(Sale, {
  foreignKey: "saleId",
  as: "sale",
});
module.exports = { Sale, SaleItem, SaleReturn };
