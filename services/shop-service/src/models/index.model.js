"use strict";

const Shop = require("./Shop.model");
// ❌ ShopDepartment removed - Department management moved to Company Service
const ShopOperatingHours = require("./ShopOperatingHours.model");
const ShopPreferences = require("./ShopPreferences.model");
const Outbox = require("./Outbox.model");
const ProcessedEvent = require("./ProcessedEvent.model");

module.exports = {
  Shop,
  ShopOperatingHours,
  ShopPreferences,
  Outbox,
  ProcessedEvent,
  // ShopDepartment no longer exported - Use Company Service instead
};

