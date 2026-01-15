"use strict";

const registerConsumers = require("../utils/events/registerConsumer");
const consumerConfigs = require("./config/eventConsumers.config");
const rabbitmq = require('/app/shared/rabbitmq.js');
const logger = require('../config/logger');

const startConsumer = async () => {
    try {
        await rabbitmq.connect();
        logger.info("Document Service connected to RabbitMQ (Shared)");

        await registerConsumers(consumerConfigs);
    } catch (error) {
        logger.error("Failed to start consumers:", error);
        process.exit(1);
    }
};

module.exports = { startConsumer };
