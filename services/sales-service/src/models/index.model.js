const Sale = require("./Sales.model");
const SalesItem = require("./SalesItem.model");
const SalesReturn = require("./Salesreturn.model");
const Invoice = require("./Invoice.model");
const SalesReturnItem = require("./salesReturnItem.model");
const KnownUser = require("./KnownUser.model");

// Associations

// KnownUser associations
Sale.belongsTo(KnownUser, {
  foreignKey: "knownUserId",
  as: "knownUser",
  allowNull: false,
});
KnownUser.hasMany(Sale, {
  foreignKey: "knownUserId",
  as: "sales",
  onDelete: "SET NULL",
});

// Sale-SalesItem associations
Sale.hasMany(SalesItem, {
  foreignKey: "saleId",
  as: "items",
  onDelete: "CASCADE",
});
SalesItem.belongsTo(Sale, { foreignKey: "saleId", as: "sale" });

// Sale-SalesReturn associations
Sale.hasMany(SalesReturn, {
  foreignKey: "saleId",
  as: "returns",
  onDelete: "CASCADE",
});
SalesReturn.belongsTo(Sale, { foreignKey: "saleId", as: "sale" });

// Sale-Invoice associations
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

module.exports = { Sale, SalesItem, SalesReturn, Invoice, SalesReturnItem, KnownUser };
