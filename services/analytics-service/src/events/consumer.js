"use strict";

const registerConsumers = require("../utils/events/registerConsumer");
const consumerConfigs = require("./config/eventConsumers.config");

const consumeEvents = async () => {
    await registerConsumers(consumerConfigs);
};

module.exports = consumeEvents;
