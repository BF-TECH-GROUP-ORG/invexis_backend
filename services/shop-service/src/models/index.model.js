"use strict";

const Shop = require("./Shop.model");
const ShopDepartment = require("./ShopDepartment.model");
const ShopOperatingHours = require("./ShopOperatingHours.model");
const ShopPreferences = require("./ShopPreferences.model");
const Outbox = require("./Outbox.model");

module.exports = {
  Shop,
  ShopDepartment,
  ShopOperatingHours,
  ShopPreferences,
  Outbox,
};

