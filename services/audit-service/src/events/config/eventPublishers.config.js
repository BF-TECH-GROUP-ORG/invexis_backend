"use strict";

const { exchanges } = require("/app/shared/rabbitmq");

module.exports = [
    {
        name: "Audit Events",
        exchange: exchanges.topic,
        events: [
            { key: "audit.log.created", description: "Audit log created" },
        ],
    },
];
