const Sale = require("./Sales.model");
const SalesItem = require("./SalesItem.model");
const SalesReturn = require("./Salesreturn.model");
const SalesReturnItem = require("./salesReturnItem.model");
const KnownUser = require("./KnownUser.model");
const ProcessedEvent = require("./ProcessedEvent.model");

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



// SalesReturn-SalesReturnItem associations
SalesReturn.hasMany(SalesReturnItem, {
  foreignKey: "returnId",
  as: "items",
  onDelete: "CASCADE",
});

SalesReturnItem.belongsTo(SalesReturn, {
  foreignKey: "returnId",
  as: "return",
});

module.exports = { Sale, SalesItem, SalesReturn, SalesReturnItem, KnownUser, ProcessedEvent };
