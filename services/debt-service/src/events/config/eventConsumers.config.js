/**
 * Event Consumers Configuration - Debt Service
 * Defines all events that debt-service consumes from other services
 */

module.exports = [
    {
        name: "sales",
        queue: "debt_sales_events",
        exchange: "events_topic",
        pattern: "sale.#",
        handler: require("../handlers/salesEvent.handler"),
        events: [
            "sale.created",
            "sale.payment.status.changed"
        ]
    }
];
