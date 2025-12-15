"use strict";

const { exchanges } = require("/app/shared/rabbitmq");

module.exports = [
    {
        name: "Analytics Events",
        exchange: exchanges.topic,
        events: [
            { key: "analytics.report.generated", description: "Analytics report generated" },
        ],
    },
];
