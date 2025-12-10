"use strict";

const Shop = require("./Shop.model");
// ❌ ShopDepartment removed - Department management moved to Company Service
const ShopOperatingHours = require("./ShopOperatingHours.model");
const ShopPreferences = require("./ShopPreferences.model");
const Outbox = require("./Outbox.model");

module.exports = {
  Shop,
  ShopOperatingHours,
  ShopPreferences,
  Outbox,
  // ShopDepartment no longer exported - Use Company Service instead
};

